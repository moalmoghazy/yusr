import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError, assertBalanced, computeDonationBreakdown, DEMO_FX, type CreateDonationRequest } from '@yusr/core';
import { DonationsService } from '../src/donations/donations.service';
import { RefreshingFx } from '../src/payments/fx';
import type { FetchLike, WebhookInput } from '../src/payments/gateway';
import { PaymobGateway, paymobSignature } from '../src/payments/gateways/paymob.gateway';
import { GatewayRegistry } from '../src/payments/registry';
import { CASE_ID, DRAFT_CASE_ID, SAR_CASE_ID, TEST_CONFIG, USERS, actorOf, key, setup, webhook } from './support/fixtures';

const guest = { name: 'Ahmed Salah', email: 'ahmed@example.com', phone: null };

function request(overrides: Partial<CreateDonationRequest> = {}): CreateDonationRequest {
  return {
    caseId: CASE_ID,
    amountMinor: 1_250_00,
    currency: 'EGP',
    method: 'card',
    coverFees: true,
    anonymous: false,
    type: 'sadaqah',
    dedication: null,
    donor: guest,
    locale: 'ar',
    returnUrl: null,
    ...overrides,
  };
}

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => DomainError.is(error) && error.code === code);
}

describe('creating a donation', () => {
  it('prices it with the shared breakdown, numbers the receipt and returns the checkout step', async () => {
    const { donations, gateways, db } = await setup();
    const response = await donations.create(request(), { actor: null, idempotencyKey: key() });

    const expected = computeDonationBreakdown({ amountMinor: 1_250_00, currency: 'EGP', method: 'card', coverFees: true, caseCurrency: 'EGP', fx: DEMO_FX });
    assert.deepEqual(response.breakdown, expected);
    assert.equal(response.receiptNumber, 'YSR-2026-000001');
    assert.equal(response.status, 'requires_action');
    assert.deepEqual(response.action, { type: 'redirect', provider: 'paymob', url: 'https://pay.example/paymob/YSR-2026-000001' });

    const [checkout] = gateways.paymob.checkouts;
    assert.equal(checkout?.amountMinor, expected.chargedMinor);
    assert.equal(checkout?.notificationUrl, 'https://api.yusr.example/v1/webhooks/paymob');
    assert.match(checkout?.returnUrl ?? '', /^https:\/\/yusr\.example\/ar\/receipt\?donation=.+&token=[a-f0-9]{40}$/);

    const stored = await db.read.donations.byId(response.donationId);
    assert.equal(stored?.guestContact?.email, 'ahmed@example.com');
    assert.equal(stored?.chargedMinor, expected.chargedMinor);
  });

  it('returns the same donation for a retried request and never charges twice', async () => {
    const { donations, gateways } = await setup();
    const idempotencyKey = key();
    const first = await donations.create(request(), { actor: null, idempotencyKey });
    const second = await donations.create(request(), { actor: null, idempotencyKey });
    assert.equal(second.donationId, first.donationId);
    assert.deepEqual(second.action, first.action);
    assert.equal(gateways.paymob.checkouts.length, 1);
  });

  it('refuses a reused key with a different body', async () => {
    const { donations } = await setup();
    const idempotencyKey = key();
    await donations.create(request(), { actor: null, idempotencyKey });
    await rejects(donations.create(request({ amountMinor: 500_00 }), { actor: null, idempotencyKey }), 'IDEMPOTENCY_CONFLICT');
  });

  it('retries the checkout when the provider failed the first time', async () => {
    const { donations, gateways } = await setup();
    const idempotencyKey = key();
    gateways.paymob.failNextCheckout = true;
    await rejects(donations.create(request(), { actor: null, idempotencyKey }), 'PAYMENT_PROVIDER_ERROR');
    const retried = await donations.create(request(), { actor: null, idempotencyKey });
    assert.equal(retried.status, 'requires_action');
    assert.equal(gateways.paymob.checkouts.length, 1);
  });

  it('enforces the donation rules', async () => {
    const { donations } = await setup();
    await rejects(donations.create(request({ caseId: DRAFT_CASE_ID }), { actor: null, idempotencyKey: key() }), 'CASE_NOT_DONATABLE');
    await rejects(
      donations.create(request({ caseId: SAR_CASE_ID, currency: 'SAR', method: 'mada', type: 'zakat' }), { actor: null, idempotencyKey: key() }),
      'ZAKAT_NOT_ELIGIBLE',
    );
    await rejects(donations.create(request({ amountMinor: 5_00 }), { actor: null, idempotencyKey: key() }), 'AMOUNT_TOO_LOW');
    await rejects(donations.create(request({ method: 'mada' }), { actor: null, idempotencyKey: key() }), 'METHOD_NOT_AVAILABLE');
    await rejects(donations.create(request({ donor: null }), { actor: null, idempotencyKey: key() }), 'VALIDATION_FAILED');
    await rejects(donations.create(request(), { actor: null, idempotencyKey: 'short' }), 'VALIDATION_FAILED');
    await rejects(donations.create(request({ returnUrl: 'https://evil.example/steal' }), { actor: null, idempotencyKey: key() }), 'VALIDATION_FAILED');
  });

  it('refuses more than the case still needs, saying how much that is, and accepts exactly that', async () => {
    const { donations, db } = await setup();
    const item = (await db.read.cases.byId(CASE_ID))!;
    const left = item.goalMinor - item.raisedMinor;
    await assert.rejects(
      donations.create(request({ amountMinor: left + 1_00 }), { actor: null, idempotencyKey: key() }),
      (error: unknown) => DomainError.is(error, 'AMOUNT_ABOVE_REMAINING') && error.details?.['remainingMinor'] === left,
    );
    const exact = await donations.create(request({ amountMinor: left }), { actor: null, idempotencyKey: key() });
    assert.equal(exact.breakdown.amountMinor, left);
  });

  it('lets a signed-in donor give without guest details and accepts the app scheme as return URL', async () => {
    const { donations, gateways } = await setup();
    const response = await donations.create(request({ donor: null, returnUrl: 'yusr://donations/done' }), {
      actor: actorOf(USERS.donor),
      idempotencyKey: key(),
      channel: 'mobile',
    });
    assert.equal(response.status, 'requires_action');
    assert.equal(gateways.paymob.checkouts[0]?.customer.email, USERS.donor.email);
    assert.match(gateways.paymob.checkouts[0]?.returnUrl ?? '', /^yusr:\/\/donations\/done\?donation=/);
  });
});

describe('payment webhooks', () => {
  async function paidDonation(overrides: Partial<CreateDonationRequest> = {}) {
    const context = await setup();
    const created = await context.donations.create(request(overrides), { actor: null, idempotencyKey: key() });
    return { ...context, created };
  }

  it('posts a balanced ledger entry, credits the case and queues the receipt', async () => {
    const { donations, db, created } = await paidDonation();
    const result = await donations.handleWebhook(
      'paymob',
      webhook({ eventId: 'evt_1', reference: created.receiptNumber, outcome: 'succeeded', amountMinor: created.breakdown.chargedMinor, currency: 'EGP' }),
    );
    assert.deepEqual(result, { status: 'processed', donationId: created.donationId, donationStatus: 'succeeded', caseFunded: false });

    const lines = db.journalLines();
    assert.ok(lines.length >= 3);
    assertBalanced(lines);
    const credit = lines.find((line) => line.account === `liability:case:${CASE_ID}`);
    assert.equal(credit?.amountMinor, 1_250_00, 'the donor covered the fee, so the case receives the full gift');

    const item = await db.read.cases.byId(CASE_ID);
    assert.equal(item?.raisedMinor, 1_250_00);
    assert.equal(item?.donorsCount, 1);
    const [fund] = await db.read.ledger.caseFund(CASE_ID);
    assert.equal(fund?.heldMinor, 1_250_00);
    assert.ok(db.outboxEvents().some((event) => event.type === 'donation.succeeded' && event.aggregateId === created.donationId));

    const receipt = await donations.receipt(created.donationId, { actor: null, token: created.receiptToken });
    assert.equal(receipt.status, 'succeeded');
    assert.equal(receipt.netToCaseMinor, 1_250_00);
  });

  it('acknowledges a replayed webhook without crediting twice', async () => {
    const { donations, db, created } = await paidDonation();
    const event = { eventId: 'evt_1', reference: created.receiptNumber, outcome: 'succeeded', amountMinor: created.breakdown.chargedMinor, currency: 'EGP' };
    await donations.handleWebhook('paymob', webhook(event));
    assert.deepEqual(await donations.handleWebhook('paymob', webhook(event)), { status: 'duplicate' });
    assert.equal((await db.read.cases.byId(CASE_ID))?.raisedMinor, 1_250_00);
  });

  it('rejects unsigned webhooks before touching anything', async () => {
    const { donations, db, created } = await paidDonation();
    await rejects(
      donations.handleWebhook(
        'paymob',
        webhook({ eventId: 'evt_x', reference: created.receiptNumber, outcome: 'succeeded', amountMinor: 1, currency: 'EGP' }, 'forged'),
      ),
      'INVALID_SIGNATURE',
    );
    assert.equal(db.journalLines().length, 0);
  });

  it('parks a payment whose amount differs for review instead of crediting it', async () => {
    const { donations, db, created } = await paidDonation();
    const result = await donations.handleWebhook(
      'paymob',
      webhook({ eventId: 'evt_2', reference: created.receiptNumber, outcome: 'succeeded', amountMinor: 10_00, currency: 'EGP' }),
    );
    assert.equal(result.status === 'processed' && result.donationStatus, 'needs_review');
    assert.equal(db.journalLines().length, 0);
    assert.ok(db.outboxEvents().some((event) => event.type === 'finance.review_needed'));
    assert.ok(db.auditRows().some((row) => row.action === 'donation.needs_review'));
  });

  it('records the actual fee when the case absorbs it', async () => {
    const { donations, db, created } = await paidDonation({ coverFees: false, amountMinor: 1_000_00 });
    await donations.handleWebhook(
      'paymob',
      webhook({ eventId: 'evt_3', reference: created.receiptNumber, outcome: 'succeeded', amountMinor: 1_000_00, currency: 'EGP', feeMinor: 31_00 }),
    );
    const receipt = await donations.receipt(created.donationId, { actor: null, token: created.receiptToken });
    assert.equal(receipt.feeMinor, 31_00);
    assert.equal(receipt.netToCaseMinor, 969_00);
    assertBalanced(db.journalLines());
  });

  it('marks the case funded exactly once when a gift reaches the goal, and books Yusr’s fee then', async () => {
    const { donations, db } = await setup();
    await db.transaction((tx) => tx.cases.update(CASE_ID, { platformFeeMinor: 4_545_00 }));
    const big = await donations.create(
      request({ amountMinor: 49_000_00, coverFees: true, donor: { name: 'Big Donor', email: 'big@example.com', phone: null } }),
      {
        actor: actorOf(USERS.donor),
        idempotencyKey: key(),
      },
    );
    await donations.handleWebhook(
      'paymob',
      webhook({ eventId: 'evt_big', reference: big.receiptNumber, outcome: 'succeeded', amountMinor: big.breakdown.chargedMinor, currency: 'EGP' }),
    );
    const last = await donations.create(request({ amountMinor: 1_000_00 }), { actor: null, idempotencyKey: key() });
    const result = await donations.handleWebhook(
      'paymob',
      webhook({ eventId: 'evt_last', reference: last.receiptNumber, outcome: 'succeeded', amountMinor: last.breakdown.chargedMinor, currency: 'EGP' }),
    );
    assert.equal(result.status === 'processed' && result.caseFunded, true);
    const item = await db.read.cases.byId(CASE_ID);
    assert.equal(item?.status, 'funded');
    assert.ok(item?.fundedAt);
    assert.equal(db.outboxEvents().filter((event) => event.type === 'case.funded').length, 1);
    const transitions = await db.read.cases.transitions(CASE_ID);
    assert.deepEqual(
      transitions.map((row) => [row.fromStatus, row.toStatus, row.actorId]),
      [['published', 'funded', null]],
    );
    const fee = db.journalLines().filter((line) => line.account === 'revenue:platform_fees');
    assert.deepEqual(
      fee.map((line) => [line.direction, line.amountMinor]),
      [['credit', 4_545_00]],
    );
    assertBalanced(db.journalLines());
    const [fund] = await db.read.ledger.caseFund(CASE_ID);
    assert.equal(fund?.heldMinor, item!.raisedMinor - 4_545_00, 'the rest stays for the payees');
  });

  it('marks failures and lets a late success after expiry still be credited', async () => {
    const { donations, db, clock, created } = await paidDonation({ method: 'fawry', coverFees: false });
    assert.equal(created.status, 'awaiting_transfer');
    clock.advance(73 * 3_600_000);
    assert.equal(await donations.expireStale(), 1);
    assert.equal((await db.read.donations.byId(created.donationId))?.status, 'expired');
    const late = await donations.handleWebhook(
      'fawry',
      webhook({
        eventId: 'fawry_1:PAID',
        reference: created.receiptNumber,
        outcome: 'succeeded',
        amountMinor: created.breakdown.chargedMinor,
        currency: 'EGP',
        feeMinor: 20_00,
      }),
    );
    assert.equal(late.status === 'processed' && late.donationStatus, 'succeeded');

    const failed = await donations.create(request(), { actor: null, idempotencyKey: key() });
    const result = await donations.handleWebhook(
      'paymob',
      webhook({
        eventId: 'evt_f',
        reference: failed.receiptNumber,
        outcome: 'failed',
        amountMinor: failed.breakdown.chargedMinor,
        currency: 'EGP',
        failureCode: 'insufficient_funds',
      }),
    );
    assert.equal(result.status === 'processed' && result.donationStatus, 'failed');
  });

  it('keeps each currency balanced for a dollar gift to an Egyptian case', async () => {
    const { donations, db, created } = await paidDonation({ currency: 'USD', amountMinor: 50_00, method: 'card', coverFees: true });
    await donations.handleWebhook(
      'stripe',
      webhook({ eventId: 'evt_usd', reference: created.receiptNumber, outcome: 'succeeded', amountMinor: created.breakdown.chargedMinor, currency: 'USD' }),
    );
    const lines = db.journalLines();
    assert.deepEqual([...new Set(lines.map((line) => line.currency))].sort(), ['EGP', 'USD']);
    assertBalanced(lines);
    const credit = lines.find((line) => line.account === `liability:case:${CASE_ID}`);
    assert.equal(credit?.amountMinor, Math.round(50_00 * DEMO_FX.rates.USD));
  });
});

describe('bank transfers and receipts', () => {
  it('lets finance confirm an InstaPay transfer, and only for the exact amount', async () => {
    const { donations, db } = await setup();
    const created = await donations.create(request({ method: 'instapay', coverFees: false }), { actor: null, idempotencyKey: key() });
    assert.equal(created.status, 'awaiting_transfer');

    await rejects(
      donations.confirmTransfer(created.donationId, { bankReference: 'CIB-1', receivedMinor: 1_000_00 }, { actor: actorOf(USERS.financeA) }),
      'AMOUNT_MISMATCH',
    );
    await rejects(
      donations.confirmTransfer(created.donationId, { bankReference: 'CIB-1', receivedMinor: 1_250_00 }, { actor: actorOf(USERS.moderator) }),
      'FORBIDDEN',
    );
    await rejects(
      donations.confirmTransfer(created.donationId, { bankReference: 'CIB-1', receivedMinor: 1_250_00 }, { actor: actorOf(USERS.financeA, false) }),
      'FORBIDDEN',
    );

    const receipt = await donations.confirmTransfer(
      created.donationId,
      { bankReference: 'CIB-778812', receivedMinor: 1_250_00 },
      { actor: actorOf(USERS.financeA) },
    );
    assert.equal(receipt.status, 'succeeded');
    assert.equal(receipt.feeMinor, 0);
    assert.ok(db.auditRows().some((row) => row.action === 'donation.transfer_confirmed' && row.actorId === USERS.financeA.id));
  });

  it('confirms only InstaPay transfers that are awaited or expired, each bank reference once', async () => {
    const { donations, db, clock } = await setup();
    const finance = { actor: actorOf(USERS.financeA) };
    const card = await donations.create(request(), { actor: null, idempotencyKey: key() });
    await rejects(
      donations.confirmTransfer(card.donationId, { bankReference: 'CIB-1', receivedMinor: card.breakdown.chargedMinor }, finance),
      'VALIDATION_FAILED',
    );
    await db.transaction((tx) => tx.donations.update(card.donationId, { status: 'needs_review' }));
    await rejects(
      donations.confirmTransfer(card.donationId, { bankReference: 'CIB-1', receivedMinor: card.breakdown.chargedMinor }, finance),
      'VALIDATION_FAILED',
    );
    assert.equal(db.journalLines().length, 0);

    const first = await donations.create(request({ method: 'instapay', coverFees: false }), { actor: null, idempotencyKey: key() });
    const second = await donations.create(request({ method: 'instapay', coverFees: false }), { actor: null, idempotencyKey: key() });
    await donations.confirmTransfer(first.donationId, { bankReference: 'CIB-500', receivedMinor: 1_250_00 }, finance);
    await rejects(donations.confirmTransfer(first.donationId, { bankReference: 'CIB-501', receivedMinor: 1_250_00 }, finance), 'VALIDATION_FAILED');
    await rejects(donations.confirmTransfer(second.donationId, { bankReference: 'CIB-500', receivedMinor: 1_250_00 }, finance), 'VALIDATION_FAILED');

    // A transfer that arrives after the window closed is still matched.
    clock.advance(49 * 3_600_000);
    assert.equal(await donations.expireStale(), 1);
    const late = await donations.confirmTransfer(second.donationId, { bankReference: 'CIB-502', receivedMinor: 1_250_00 }, finance);
    assert.equal(late.status, 'succeeded');
  });

  it('hides receipts from anyone without the token, the donor account or finance access', async () => {
    const { donations } = await setup();
    const created = await donations.create(request(), { actor: null, idempotencyKey: key() });
    await rejects(donations.receipt(created.donationId, { actor: null, token: 'wrong' }), 'NOT_FOUND');
    await rejects(donations.receipt(created.donationId, { actor: actorOf(USERS.moderator), token: null }), 'NOT_FOUND');
    assert.equal((await donations.receipt(created.donationId, { actor: actorOf(USERS.financeB), token: null })).id, created.donationId);
    await rejects(donations.receipt(created.donationId, { actor: actorOf(USERS.financeB, false), token: null }), 'NOT_FOUND');
  });
});

describe('Paymob callbacks against the real gateway', () => {
  const config = { secretKey: 'egy_sk_test', publicKey: 'egy_pk_test', hmacSecret: 'paymob-hmac-secret', integrations: { card: 4_101, wallet: 4_102 } };
  const ORDER = 217_503_754;

  /** Donations wired to a PaymobGateway whose API (intentions and transaction lookups) is faked. */
  async function paymobSetup() {
    const context = await setup();
    const transactions = new Map<string, Record<string, unknown>>();
    const lookups: string[] = [];
    const api: FetchLike = async (url) => {
      const match = /\/api\/acceptance\/transactions\/(\d+)$/.exec(String(url));
      if (match) lookups.push(match[1]!);
      const body = match ? transactions.get(match[1]!) : { id: 'pi_1', client_secret: 'csk_1', intention_order_id: ORDER };
      return new Response(JSON.stringify(body ?? { detail: 'Not found' }), { status: body ? 200 : 404 });
    };
    const paymob = new PaymobGateway(config, api);
    const donations = new DonationsService({
      db: context.db,
      gateways: new GatewayRegistry([paymob]),
      fx: context.fx,
      clock: context.clock,
      ids: context.ids,
      config: TEST_CONFIG,
    });
    const created = await donations.create(request(), { actor: null, idempotencyKey: key() });
    const base = {
      id: 192_036_465,
      pending: false,
      amount_cents: created.breakdown.chargedMinor,
      success: true,
      is_auth: false,
      is_capture: false,
      is_standalone_payment: true,
      is_voided: false,
      is_refunded: false,
      is_3d_secure: true,
      integration_id: 4_101,
      has_parent_transaction: false,
      error_occured: false,
      currency: 'EGP',
      owner: 302_852,
      created_at: '2026-09-26T09:03:11.412094',
      order: { id: ORDER, merchant_order_id: created.receiptNumber },
      source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
      data: { message: 'Approved' },
    };
    const callback = (obj: Record<string, unknown>, hmac = paymobSignature(obj, config.hmacSecret)): WebhookInput => ({
      rawBody: Buffer.from(JSON.stringify({ type: 'TRANSACTION', obj })),
      headers: {},
      query: { hmac },
    });
    return { ...context, donations, created, base, transactions, lookups, callback };
  }

  it('credits only what Paymob confirms, and processes pending then paid callbacks of one transaction', async () => {
    const { donations, db, created, base, transactions, callback } = await paymobSetup();
    const pending = { ...base, success: false, pending: true };
    transactions.set('192036465', pending);
    assert.deepEqual(await donations.handleWebhook('paymob', callback(pending)), {
      status: 'processed',
      donationId: created.donationId,
      donationStatus: 'requires_action',
      caseFunded: false,
    });

    transactions.set('192036465', base);
    const paid = await donations.handleWebhook('paymob', callback(base));
    assert.equal(paid.status === 'processed' && paid.donationStatus, 'succeeded');
    assert.deepEqual(await donations.handleWebhook('paymob', callback(base)), { status: 'duplicate' });
    assert.equal((await db.read.donations.latestAttempt(created.donationId))?.providerRef, '192036465');
  });

  it('does not credit anything for a callback whose signed fields were shifted', async () => {
    const { donations, db, created, base, transactions, lookups, callback } = await paymobSetup();
    // The donor really paid 1 EGP on another order; the callback for it is genuinely signed.
    const small = { ...base, id: 192_036_466, amount_cents: 100, order: { id: 217_503_755, merchant_order_id: 'YSR-2026-000999' } };
    transactions.set('192036466', small);
    const hmac = paymobSignature(small, config.hmacSecret);
    // Slide digits between neighbouring fields and point the unsigned merchant reference at our donation.
    const forged = [
      { ...small, amount_cents: 1_002, created_at: '026-09-26T09:03:11.412094', order: { id: 217_503_755, merchant_order_id: created.receiptNumber } },
      { ...small, id: 1_920_364_664, integration_id: 101 },
      { ...small, is_voided: 'false2', order: { id: 17_503_755, merchant_order_id: created.receiptNumber } },
    ];
    for (const obj of forged) {
      assert.equal(paymobSignature(obj, config.hmacSecret), hmac);
      await rejects(donations.handleWebhook('paymob', callback(obj, hmac)), 'INVALID_SIGNATURE');
    }
    // The genuine callback names another order, so the merchant reference cannot redirect it to us.
    const relabelled = { ...small, order: { id: 217_503_755, merchant_order_id: created.receiptNumber } };
    transactions.set('192036466', relabelled);
    assert.deepEqual(await donations.handleWebhook('paymob', callback(relabelled)), { status: 'ignored', reason: 'unknown_reference' });

    assert.equal((await db.read.donations.byId(created.donationId))?.status, 'requires_action');
    assert.equal(db.journalLines().length, 0);
    assert.equal((await db.read.cases.byId(CASE_ID))?.raisedMinor, 0);
    assert.equal(lookups.length, 2, 'only the last shift looked plausible enough to ask Paymob, which disagreed');
  });

  it('parks the donation when Paymob reports a different amount than the callback', async () => {
    const { donations, db, created, base, transactions, callback } = await paymobSetup();
    transactions.set('192036465', { ...base, amount_cents: 100 });
    const result = await donations.handleWebhook('paymob', callback(base));
    assert.equal(result.status === 'processed' && result.donationStatus, 'needs_review');
    assert.equal((await db.read.donations.byId(created.donationId))?.status, 'needs_review');
    assert.equal(db.journalLines().length, 0);
  });
});

describe('exchange rates', () => {
  it('refuses cross-currency donations once the rates are older than the allowed age', async () => {
    const { db, registry, clock, ids } = await setup();
    let now = Date.parse('2026-09-26T12:00:00Z');
    const fx = new RefreshingFx(
      { url: 'https://fx.example/rates', maxAgeHours: 36, fallback: { ...DEMO_FX, asOf: '2026-09-26T00:00:00Z' } },
      async () => new Response('{}', { status: 503 }),
      () => now,
    );
    const donations = new DonationsService({ db, gateways: registry, fx, clock, ids, config: TEST_CONFIG });
    const usd = request({ currency: 'USD', amountMinor: 50_00, method: 'card' });
    assert.equal((await donations.quoteForCase(CASE_ID, usd)).caseCurrency, 'EGP');

    now = Date.parse('2026-09-28T00:00:01Z');
    await rejects(donations.quoteForCase(CASE_ID, usd), 'METHOD_NOT_AVAILABLE');
    await rejects(donations.create(usd, { actor: null, idempotencyKey: key() }), 'METHOD_NOT_AVAILABLE');
    // Gifts in the case's own currency need no rate.
    assert.equal((await donations.create(request(), { actor: null, idempotencyKey: key() })).status, 'requires_action');
  });
});
