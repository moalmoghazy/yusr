import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Channels } from '../src/notifications/channels';
import { LogChannels } from '../src/notifications/channels';
import { Dispatcher } from '../src/notifications/dispatcher';
import { OutboxWorker } from '../src/notifications/outbox.worker';
import { Analytics } from '../src/integrations/posthog';
import { BaserowClient } from '../src/integrations/baserow';
import { SlackNotifier } from '../src/integrations/slack';
import { amountBand } from '../src/integrations/posthog';
import { CASE_ID, USERS, actorOf, key, setup, webhook } from './support/fixtures';

async function setupWorker(channels: Channels = new LogChannels(() => undefined)) {
  const context = await setup();
  const dispatcher = new Dispatcher({
    db: context.db,
    channels,
    slack: new SlackNotifier({}),
    baserow: new BaserowClient(null),
    analytics: new Analytics(null),
    links: { web: 'https://yusr.example', admin: 'https://admin.yusr.example' },
    clock: () => context.clock.now(),
  });
  const worker = new OutboxWorker(context.db, dispatcher, context.donations, context.clock, { error: () => undefined });
  return { ...context, worker, channels };
}

async function give(context: Awaited<ReturnType<typeof setupWorker>>, amountMinor: number, asDonor: boolean) {
  const created = await context.donations.create(
    {
      caseId: CASE_ID,
      amountMinor,
      currency: 'EGP',
      method: 'card',
      coverFees: true,
      anonymous: false,
      type: 'sadaqah',
      dedication: null,
      donor: asDonor ? null : { name: 'Guest Giver', email: 'guest@example.com', phone: null },
      locale: 'ar',
      returnUrl: null,
    },
    { actor: asDonor ? actorOf(USERS.donor) : null, idempotencyKey: key('notify') },
  );
  await context.donations.handleWebhook(
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

describe('outbox delivery', () => {
  it('sends the receipt to a guest by email and to a donor in the app, once', async () => {
    const context = await setupWorker();
    const channels = context.channels as LogChannels;
    const guest = await give(context, 500_00, false);
    await give(context, 700_00, true);
    await context.worker.tick();

    const guestMail = channels.sent.find((item) => item.channel === 'email' && item.to === 'guest@example.com');
    assert.ok(guestMail);
    assert.match(guestMail.text, new RegExp(guest.receiptNumber));
    const inbox = await context.db.read.notifications.forUser(USERS.donor.id, 10);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.template, 'receipt');

    const before = channels.sent.length;
    await context.worker.tick();
    assert.equal(channels.sent.length, before, 'sent events are not delivered again');
  });

  it('tells every donor when the case is fully funded', async () => {
    const context = await setupWorker();
    const channels = context.channels as LogChannels;
    await give(context, 20_000_00, true);
    await give(context, 30_000_00, false);
    await context.worker.tick();
    const funded = channels.sent.filter((item) => item.channel === 'email' && /اكتمل تمويل/.test(item.text));
    assert.ok(
      channels.sent.some((item) => item.channel === 'push' && item.to === USERS.donor.id),
      'registered donors also get a push',
    );
    assert.deepEqual(funded.map((item) => item.to).sort(), [USERS.donor.email, 'guest@example.com'].sort());
  });

  it('backs off after a failure and gives up after eight attempts', async () => {
    const failing: Channels = {
      email: async () => {
        throw new Error('smtp down');
      },
      sms: async () => undefined,
      whatsapp: async () => undefined,
      push: async () => undefined,
    };
    const context = await setupWorker(failing);
    await give(context, 500_00, false);
    await context.worker.tick();
    let event = context.db.outboxEvents().find((row) => row.type === 'donation.succeeded')!;
    assert.equal(event.status, 'pending');
    assert.equal(event.attempts, 1);
    assert.equal(event.lastError, 'smtp down');
    assert.equal(event.availableAt.getTime() - context.clock.now().getTime(), 30_000);

    for (let i = 0; i < 12; i += 1) {
      context.clock.advance(13 * 3_600_000);
      await context.worker.tick();
    }
    event = context.db.outboxEvents().find((row) => row.type === 'donation.succeeded')!;
    assert.equal(event.status, 'failed');
    assert.equal(event.attempts, 9);
  });

  it('keeps analytics free of personal data', () => {
    assert.equal(amountBand(1_250), '1k–5k');
    assert.equal(amountBand(50), '0–100');
    assert.equal(amountBand(250_000), '100k+');
  });
});
