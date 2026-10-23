/**
 * «طريقة التواصل المفضلة»: the donor's chosen channel is stored with the gift, every message about it
 * goes there, and when a funded case is closed each donor is told — privately — with their receipt.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CreateDonationRequest } from '@yusr/core';
import { CasesService } from '../src/cases/cases.service';
import { FieldCipher } from '../src/common/cipher';
import { MemoryKv } from '../src/common/kv';
import { RateLimiter } from '../src/common/rate-limit';
import { Analytics } from '../src/integrations/posthog';
import { BaserowClient } from '../src/integrations/baserow';
import { SlackNotifier } from '../src/integrations/slack';
import { DemoChannels, HttpChannels, LogChannels } from '../src/notifications/channels';
import { Dispatcher } from '../src/notifications/dispatcher';
import { OutboxWorker } from '../src/notifications/outbox.worker';
import { PartnersService } from '../src/partners/partners.service';
import type { FetchLike } from '../src/payments/gateway';
import { CASE_ID, USERS, actorOf, key, setup, webhook } from './support/fixtures';

const WHATSAPP = '+201005556667';

async function setupFlow() {
  const context = await setup();
  const channels = new LogChannels(() => undefined);
  const dispatcher = new Dispatcher({
    db: context.db,
    channels,
    slack: new SlackNotifier({}),
    baserow: new BaserowClient(null),
    analytics: new Analytics(null),
    links: { web: 'https://yusr.example', admin: 'https://admin.yusr.example' },
    receiptLink: (donationId, locale) => context.donations.receiptLink(donationId, locale),
    clock: () => context.clock.now(),
  });
  const worker = new OutboxWorker(context.db, dispatcher, context.donations, context.clock, { error: () => undefined });
  const cipher = new FieldCipher(FieldCipher.randomKey());
  const limiter = new RateLimiter(new MemoryKv(context.clock));
  const partners = new PartnersService({ db: context.db, cipher, clock: context.clock, ids: context.ids, limiter, config: { codePepper: 'code-pepper' } });
  const cases = new CasesService({ db: context.db, cipher, clock: context.clock, ids: context.ids, partners, config: { nationalIdPepper: 'pepper' } });
  return { ...context, channels, worker, cases };
}

type Flow = Awaited<ReturnType<typeof setupFlow>>;

function request(overrides: Partial<CreateDonationRequest>): CreateDonationRequest {
  return {
    caseId: CASE_ID,
    amountMinor: 500_00,
    currency: 'EGP',
    method: 'card',
    coverFees: true,
    anonymous: false,
    type: 'sadaqah',
    dedication: null,
    donor: null,
    locale: 'ar',
    returnUrl: null,
    ...overrides,
  };
}

async function give(flow: Flow, overrides: Partial<CreateDonationRequest>, asDonor = false) {
  const created = await flow.donations.create(request(overrides), { actor: asDonor ? actorOf(USERS.donor) : null, idempotencyKey: key('contact') });
  await flow.donations.handleWebhook(
    'paymob',
    webhook({
      eventId: `evt_${created.receiptNumber}`,
      reference: created.receiptNumber,
      outcome: 'succeeded',
      amountMinor: created.breakdown.chargedMinor,
      currency: 'EGP',
    }),
  );
  return created;
}

describe('preferred contact channel', () => {
  it('stores the chosen channel with only that contact, for guests and signed-in donors', async () => {
    const flow = await setupFlow();
    const byWhatsapp = await give(flow, { contactChannel: 'whatsapp', donor: { name: 'منى', email: 'mona@example.com', phone: WHATSAPP } });
    const byEmail = await give(flow, { contactChannel: 'email', donor: { email: 'karim@example.com' } });
    const signedIn = await give(flow, { contactChannel: 'whatsapp', donor: { phone: USERS.donor.phone } }, true);

    const whatsappRow = await flow.db.read.donations.byId(byWhatsapp.donationId);
    assert.equal(whatsappRow?.contactChannel, 'whatsapp');
    assert.deepEqual(whatsappRow?.guestContact, { name: 'منى', email: null, phone: WHATSAPP }, 'the unused email is not kept');
    const emailRow = await flow.db.read.donations.byId(byEmail.donationId);
    assert.equal(emailRow?.contactChannel, 'email');
    assert.deepEqual(emailRow?.guestContact, { name: null, email: 'karim@example.com', phone: null });
    const donorRow = await flow.db.read.donations.byId(signedIn.donationId);
    assert.equal(donorRow?.donorId, USERS.donor.id);
    assert.equal(donorRow?.contactChannel, 'whatsapp');
    assert.equal(donorRow?.guestContact?.phone, USERS.donor.phone);
  });

  it('refuses a channel without its contact, and keeps older requests working', async () => {
    const flow = await setupFlow();
    await assert.rejects(
      flow.donations.create(request({ contactChannel: 'whatsapp', donor: { email: 'mona@example.com' } }), { actor: null, idempotencyKey: key('nophone') }),
      (error: { code?: string; details?: { field?: string } }) => error.code === 'VALIDATION_FAILED' && error.details?.field === 'donor.phone',
    );
    await assert.rejects(
      flow.donations.create(request({ contactChannel: 'email' }), { actor: actorOf(USERS.donor), idempotencyKey: key('nomail') }),
      (error: { code?: string }) => error.code === 'VALIDATION_FAILED',
    );
    const legacy = await give(flow, { donor: { email: 'old@example.com' } });
    const row = await flow.db.read.donations.byId(legacy.donationId);
    assert.equal(row?.contactChannel, null);
    assert.equal(row?.guestContact?.email, 'old@example.com');
  });

  it('sends each message to the channel the donor chose', async () => {
    const flow = await setupFlow();
    await give(flow, { contactChannel: 'whatsapp', donor: { phone: WHATSAPP } });
    await give(flow, { contactChannel: 'email', donor: { email: 'karim@example.com' } });
    await give(flow, { contactChannel: 'whatsapp', donor: { phone: USERS.donor.phone } }, true);
    await flow.worker.tick();

    const receipts = flow.channels.sent.filter((entry) => entry.template === 'receipt');
    const route = (to: string) => receipts.filter((entry) => entry.to === to).map((entry) => entry.channel);
    assert.deepEqual(route(WHATSAPP), ['whatsapp']);
    assert.deepEqual(route('karim@example.com'), ['email']);
    assert.deepEqual(route(USERS.donor.phone!), ['whatsapp'], 'a signed-in donor hears on WhatsApp, as chosen');
    assert.deepEqual(route(USERS.donor.email!), [], 'and not on the account email');
    assert.ok(
      flow.channels.sent.some((entry) => entry.channel === 'push' && entry.to === USERS.donor.id),
      'the app still gets its push and inbox entry',
    );
    const whatsapp = receipts.find((entry) => entry.to === WHATSAPP)!;
    assert.match(whatsapp.text, /وصل تبرعك/);
    assert.ok(whatsapp.donationId && whatsapp.caseId === CASE_ID, 'the message knows its gift and case');
  });
});

describe('case closed', () => {
  it('tells every donor of a funded case that closes, on their channel, with their own receipt', async () => {
    const flow = await setupFlow();
    const guest = await give(flow, { amountMinor: 20_000_00, contactChannel: 'whatsapp', donor: { name: 'منى عادل', phone: WHATSAPP } });
    const hidden = await give(flow, {
      amountMinor: 10_000_00,
      anonymous: true,
      contactChannel: 'email',
      donor: { name: 'فاعل خير', email: 'quiet@example.com' },
    });
    await give(flow, { amountMinor: 20_000_00, contactChannel: 'email', donor: { email: 'mona.adel@yusr.example' }, locale: 'en' }, true);
    assert.equal((await flow.db.read.cases.byId(CASE_ID))?.status, 'funded');
    await flow.worker.tick();
    const before = flow.channels.sent.length;

    await flow.cases.transition(CASE_ID, { to: 'closed' }, { actor: actorOf(USERS.financeA) });
    const event = flow.db.outboxEvents().find((row) => row.type === 'case.closed');
    assert.ok(event, 'closing a case enqueues case.closed in the same transaction');
    assert.equal(event.payload['from'], 'funded');
    await flow.worker.tick();

    const closed = flow.channels.sent.slice(before).filter((entry) => entry.template === 'case_closed');
    assert.deepEqual(
      closed.map((entry) => `${entry.channel}:${entry.to}`).sort(),
      [`email:mona.adel@yusr.example`, `email:quiet@example.com`, `whatsapp:${WHATSAPP}`].sort(),
      'once per donor, anonymous gifts included, each on the chosen channel',
    );
    const toGuest = closed.find((entry) => entry.to === WHATSAPP)!;
    assert.match(toGuest.text, /الحالة التي ساهمت فيها «عملية قلب مفتوح لطفل» اكتملت وتم الصرف للجهات، والأمر قُضي بفضل الله/);
    assert.ok(toGuest.text.includes(`https://yusr.example/ar/receipt?donation=${guest.donationId}&token=${flow.donations.receiptToken(guest.donationId)}`));
    assert.ok(toGuest.text.includes('https://yusr.example/ar/cases/heart-surgery?tab=transparency'));
    const toAnonymous = closed.find((entry) => entry.to === 'quiet@example.com')!;
    assert.equal(toAnonymous.subject, 'اكتملت الحالة التي ساهمت فيها');
    assert.ok(!toAnonymous.text.includes('فاعل خير'), 'no donor name in the message');
    assert.ok(toAnonymous.text.includes(hidden.donationId));
    const english = closed.find((entry) => entry.to === 'mona.adel@yusr.example')!;
    assert.equal(english.subject, 'A case you supported is complete');
    assert.ok(english.text.includes('/en/receipt?donation='));

    const inbox = await flow.db.read.notifications.forUser(USERS.donor.id, 10);
    assert.ok(
      inbox.some((row) => row.template === 'case_closed'),
      'the signed-in donor’s inbox has it too',
    );

    // Retried events do not send twice.
    const sent = flow.channels.sent.length;
    await flow.worker.tick();
    assert.equal(flow.channels.sent.length, sent);
  });

  it('sends nothing when a case is closed early, before it was funded', async () => {
    const flow = await setupFlow();
    await give(flow, { contactChannel: 'whatsapp', donor: { phone: WHATSAPP } });
    await flow.worker.tick();
    await flow.cases.transition(CASE_ID, { to: 'closed', reason: 'الأسرة لم تعد بحاجة' }, { actor: actorOf(USERS.financeA) });
    await flow.worker.tick();
    assert.equal(flow.channels.sent.filter((entry) => entry.template === 'case_closed').length, 0);
  });

  it('keeps contacts off public pages', async () => {
    const flow = await setupFlow();
    await give(flow, { contactChannel: 'whatsapp', donor: { name: 'منى عادل', phone: WHATSAPP } });
    await give(flow, { contactChannel: 'email', donor: { name: 'كريم', email: 'karim@example.com' } });
    const detail = JSON.stringify(await flow.cases.detail('heart-surgery'));
    const live = JSON.stringify(await flow.donations.live());
    for (const contact of [WHATSAPP, '5556667', 'karim@example.com']) {
      assert.ok(!detail.includes(contact), `case page leaks ${contact}`);
      assert.ok(!live.includes(contact), `live ticker leaks ${contact}`);
    }
  });
});

describe('demo channels', () => {
  it('keep every message, send through a configured provider, and never print or show a contact', async () => {
    const lines: string[] = [];
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ url: String(input), body: String(init?.body) });
      return String(input).includes('graph.facebook.com')
        ? new Response('{"error":{"message":"not allowed for +201005556667"}}', { status: 400 })
        : new Response('{}');
    };
    const real = new HttpChannels({ email: { apiKey: 're_test', from: 'onboarding@resend.dev' }, whatsapp: { phoneNumberId: '123', token: 't' } }, fetchImpl);
    const channels = new DemoChannels(new LogChannels((line) => lines.push(line)), real, (line) => lines.push(line));

    await channels.email('mona@example.com', 'إيصال', 'شكرًا لك\nhttps://yusr.example/ar/receipt?donation=d1&token=abcdef0123456789', {
      template: 'receipt',
      donationId: 'd1',
    });
    await channels.whatsapp(WHATSAPP, 'وصل تبرعك', { template: 'receipt', donationId: 'd2' });
    await channels.sendOtp('+201001234567', '482913', 'ar');

    assert.equal(calls.filter((call) => call.url === 'https://api.resend.com/emails').length, 1, 'email really sent');
    assert.equal(calls.filter((call) => call.url.includes('graph.facebook.com')).length, 1, 'WhatsApp really attempted');
    assert.ok(!calls.some((call) => call.body.includes('482913')), 'sign-in codes never leave a demo');

    const history = channels.history();
    assert.deepEqual(
      history.map((entry) => [entry.channel, entry.delivery]),
      [
        ['whatsapp', 'failed'],
        ['email', 'sent'],
      ],
      'sign-in codes are not listed',
    );
    assert.equal(history[0]?.error, 'whatsapp responded 400', 'the status only, not the provider’s body');
    assert.equal(history[1]?.to, 'mo•••@example.com');
    assert.equal(history[0]?.to, '+20••••••6667');
    assert.ok(history[1]?.text.endsWith('token=•••'), 'receipt tokens hidden');
    const everything = JSON.stringify(history) + lines.join('\n');
    for (const secret of ['mona@example.com', WHATSAPP, '+201001234567', '482913', 'abcdef0123456789']) assert.ok(!everything.includes(secret), secret);
  });
});
