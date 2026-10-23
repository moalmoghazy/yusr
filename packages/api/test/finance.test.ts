import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError, assertBalanced } from '@yusr/core';
import { PayoutsService } from '../src/finance/payouts.service';
import { RefundsService } from '../src/finance/refunds.service';
import { CASE_ID, USERS, actorOf, key, setup, webhook } from './support/fixtures';

const LINE_HOSPITAL = '00000000-0000-4000-8000-0000000011a1';
const LINE_MEDICINE = '00000000-0000-4000-8000-0000000011a2';

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => DomainError.is(error) && error.code === code);
}

/** A case holding 30,000 EGP from two paid donations, with a two-line disbursement plan. */
async function fundedCase() {
  const context = await setup();
  const { db, donations } = context;
  await db.transaction(async (tx) => {
    await tx.cases.insertLines([
      {
        id: LINE_HOSPITAL,
        caseId: CASE_ID,
        payeeType: 'hospital',
        payee: { ar: 'مستشفى أبو الريش', en: 'Abu El Reesh Hospital' },
        purpose: { ar: 'العملية', en: 'Surgery' },
        amountMinor: 40_000_00,
        payeeAccountMasked: '•••••••••0002',
        position: 1,
      },
      {
        id: LINE_MEDICINE,
        caseId: CASE_ID,
        payeeType: 'pharmacy',
        payee: { ar: 'صيدلية العزبي', en: 'El Ezaby Pharmacy' },
        purpose: { ar: 'أدوية', en: 'Medicine' },
        amountMinor: 10_000_00,
        payeeAccountMasked: '•••••••••7710',
        position: 2,
      },
    ]);
  });
  const paid = [];
  for (const amountMinor of [20_000_00, 10_000_00]) {
    const created = await donations.create(
      {
        caseId: CASE_ID,
        amountMinor,
        currency: 'EGP',
        method: 'card',
        coverFees: true,
        anonymous: false,
        type: 'sadaqah',
        dedication: null,
        donor: { name: 'Donor', email: 'donor@example.com', phone: null },
        locale: 'ar',
        returnUrl: null,
      },
      { actor: null, idempotencyKey: key('fund') },
    );
    await donations.handleWebhook(
      'paymob',
      webhook({
        eventId: `evt_${created.receiptNumber}`,
        reference: created.receiptNumber,
        outcome: 'succeeded',
        amountMinor: created.breakdown.chargedMinor,
        currency: 'EGP',
        providerRef: `txn_${created.receiptNumber}`,
      }),
    );
    paid.push(created);
  }
  const payouts = new PayoutsService({ db, clock: context.clock, ids: context.ids });
  const refunds = new RefundsService({ db, gateways: context.registry, clock: context.clock, ids: context.ids });
  return { ...context, payouts, refunds, paid };
}

describe('payouts (maker-checker)', () => {
  it('needs a second officer, then posts the transfer and tells donors', async () => {
    const { payouts, db } = await fundedCase();
    const maker = actorOf(USERS.financeA);
    const checker = actorOf(USERS.financeB);

    const requested = await payouts.request({ caseId: CASE_ID, lineId: LINE_HOSPITAL, amountMinor: 25_000_00 }, { actor: maker });
    assert.equal(requested.status, 'requested');
    assert.equal(requested.payeeAccountMasked, '•••••••••0002');

    await rejects(payouts.approve(requested.id, { actor: maker }), 'SELF_APPROVAL_FORBIDDEN');
    await rejects(payouts.markPaid(requested.id, { bankReference: 'CIB-TRX-1' }, { actor: maker }), 'VALIDATION_FAILED');

    const approved = await payouts.approve(requested.id, { actor: checker });
    assert.equal(approved.approvedBy, USERS.financeB.id);
    await rejects(payouts.markPaid(approved.id, { bankReference: 'CIB-TRX-88211' }, { actor: maker }), 'SELF_APPROVAL_FORBIDDEN');
    const paid = await payouts.markPaid(approved.id, { bankReference: 'CIB-TRX-88211' }, { actor: checker });
    assert.equal(paid.status, 'paid');
    assert.equal(paid.paidBy, USERS.financeB.id);

    const [fund] = await db.read.ledger.caseFund(CASE_ID);
    assert.equal(fund?.heldMinor, 5_000_00);
    assert.equal(fund?.disbursedMinor, 25_000_00);
    assertBalanced(db.journalLines());
    assert.ok(db.outboxEvents().some((event) => event.type === 'payout.paid'));
    assert.deepEqual(
      db
        .auditRows()
        .filter((row) => row.entityId === requested.id)
        .map((row) => [row.action, row.actorId]),
      [
        ['payout.requested', USERS.financeA.id],
        ['payout.approved', USERS.financeB.id],
        ['payout.paid', USERS.financeB.id],
      ],
    );
  });

  it('never pays more than the case holds or the plan line allows', async () => {
    const { payouts } = await fundedCase();
    const maker = actorOf(USERS.financeA);
    await rejects(payouts.request({ caseId: CASE_ID, lineId: LINE_HOSPITAL, amountMinor: 31_000_00 }, { actor: maker }), 'INSUFFICIENT_CASE_FUNDS');
    await rejects(payouts.request({ caseId: CASE_ID, lineId: LINE_MEDICINE, amountMinor: 11_000_00 }, { actor: maker }), 'VALIDATION_FAILED');
    await payouts.request({ caseId: CASE_ID, lineId: LINE_HOSPITAL, amountMinor: 20_000_00 }, { actor: maker });
    // 30,000 held − 20,000 already requested = 10,000 available.
    await rejects(payouts.request({ caseId: CASE_ID, lineId: LINE_HOSPITAL, amountMinor: 10_000_01 }, { actor: maker }), 'INSUFFICIENT_CASE_FUNDS');
  });

  it('is limited to finance roles with a second factor', async () => {
    const { payouts } = await fundedCase();
    const input = { caseId: CASE_ID, lineId: LINE_HOSPITAL, amountMinor: 1_000_00 };
    await rejects(payouts.request(input, { actor: actorOf(USERS.moderator) }), 'FORBIDDEN');
    await rejects(payouts.request(input, { actor: actorOf(USERS.financeA, false) }), 'FORBIDDEN');
    await rejects(payouts.request(input, { actor: null }), 'FORBIDDEN');
  });
});

describe('refunds (maker-checker)', () => {
  it('refunds partially then fully, reversing the case credit and calling the provider once each', async () => {
    const { refunds, db, gateways, paid } = await fundedCase();
    const donation = paid[1]!;
    const first = await refunds.request(
      donation.donationId,
      { amountMinor: 4_000_00, reason: 'Donor paid twice by mistake' },
      { actor: actorOf(USERS.financeA) },
    );
    await rejects(refunds.approve(first.id, { actor: actorOf(USERS.financeA) }), 'SELF_APPROVAL_FORBIDDEN');
    const processed = await refunds.approve(first.id, { actor: actorOf(USERS.financeB) });
    assert.equal(processed.status, 'processed');
    assert.equal(gateways.paymob.refunds[0]?.providerRef, `txn_${donation.receiptNumber}`);
    assert.equal((await db.read.donations.byId(donation.donationId))?.status, 'partially_refunded');

    const rest = await refunds.request(donation.donationId, { reason: 'Donor asked for the remainder' }, { actor: actorOf(USERS.financeA) });
    assert.equal(rest.amountMinor, donation.breakdown.chargedMinor - 4_000_00);
    await refunds.approve(rest.id, { actor: actorOf(USERS.financeB) });
    assert.equal((await db.read.donations.byId(donation.donationId))?.status, 'refunded');
    assert.equal(gateways.paymob.refunds.length, 2);

    const item = await db.read.cases.byId(CASE_ID);
    assert.equal(item?.raisedMinor, 20_000_00);
    assert.equal(item?.donorsCount, 1);
    const [fund] = await db.read.ledger.caseFund(CASE_ID);
    assert.equal(fund?.heldMinor, 20_000_00);
    assertBalanced(db.journalLines());
    await rejects(
      refunds.request(donation.donationId, { amountMinor: 1, reason: 'One more please' }, { actor: actorOf(USERS.financeA) }),
      'DONATION_NOT_REFUNDABLE',
    );
  });

  it('refuses to refund money that already reached the payee', async () => {
    const { refunds, payouts, gateways, paid } = await fundedCase();
    const maker = actorOf(USERS.financeA);
    const checker = actorOf(USERS.financeB);
    const payout = await payouts.request({ caseId: CASE_ID, lineId: LINE_HOSPITAL, amountMinor: 25_000_00 }, { actor: maker });
    await payouts.approve(payout.id, { actor: checker });
    await payouts.markPaid(payout.id, { bankReference: 'CIB-TRX-1' }, { actor: checker });

    const refund = await refunds.request(paid[0]!.donationId, { reason: 'Donor changed their mind' }, { actor: maker });
    await rejects(refunds.approve(refund.id, { actor: checker }), 'INSUFFICIENT_CASE_FUNDS');
    assert.equal(gateways.paymob.refunds.length, 0, 'the provider is never asked to return money the case no longer holds');
  });

  it('sends a refund to the provider once, however often or concurrently it is approved', async () => {
    const { refunds, gateways, paid, db } = await fundedCase();
    const refund = await refunds.request(paid[0]!.donationId, { amountMinor: 1_000_00, reason: 'Donor paid twice' }, { actor: actorOf(USERS.financeA) });
    const checker = actorOf(USERS.financeB);
    const [first, second] = await Promise.allSettled([refunds.approve(refund.id, { actor: checker }), refunds.approve(refund.id, { actor: checker })]);
    assert.equal(first.status, 'fulfilled');
    assert.ok(second.status === 'rejected' && DomainError.is(second.reason, 'VALIDATION_FAILED'));
    await rejects(refunds.approve(refund.id, { actor: checker }), 'VALIDATION_FAILED');
    assert.equal(gateways.paymob.refunds.length, 1);
    assert.equal(db.journalLines().filter((line) => line.kind === 'refund' && line.direction === 'debit').length > 0, true);
    assert.equal((await db.read.refunds.byId(refund.id))?.status, 'processed');
  });

  it('never re-sends a refund whose provider call failed, and finishes one the provider accepted', async () => {
    const { refunds, gateways, paid, db } = await fundedCase();
    const checker = actorOf(USERS.financeB);
    const failing = await refunds.request(paid[0]!.donationId, { amountMinor: 1_000_00, reason: 'Provider times out' }, { actor: actorOf(USERS.financeA) });
    const realRefund = gateways.paymob.refund.bind(gateways.paymob);
    gateways.paymob.refund = async () => {
      throw new DomainError('PAYMENT_PROVIDER_ERROR', 'paymob unreachable: timeout');
    };
    await rejects(refunds.approve(failing.id, { actor: checker }), 'PAYMENT_PROVIDER_ERROR');
    gateways.paymob.refund = realRefund;
    assert.equal((await db.read.refunds.byId(failing.id))?.status, 'sending');
    await rejects(refunds.approve(failing.id, { actor: checker }), 'VALIDATION_FAILED');
    assert.equal(gateways.paymob.refunds.length, 0, 'an unknown outcome is checked with the provider, not sent again');

    // The provider accepted it (its reference is saved) but posting did not finish: approving again only posts.
    const accepted = await refunds.request(
      paid[1]!.donationId,
      { amountMinor: 2_000_00, reason: 'Posting was interrupted' },
      { actor: actorOf(USERS.financeA) },
    );
    await db.transaction((tx) => tx.refunds.update(accepted.id, { status: 'sending', approvedBy: USERS.financeB.id, providerRef: 'rf_saved' }));
    const processed = await refunds.approve(accepted.id, { actor: checker });
    assert.equal(processed.status, 'processed');
    assert.equal(processed.providerRef, 'rf_saved');
    assert.equal(gateways.paymob.refunds.length, 0);
    await rejects(
      db.transaction((tx) =>
        tx.ledger.post({
          kind: 'refund',
          refundId: accepted.id,
          lines: [
            { account: 'asset:clearing:paymob', direction: 'debit', amountMinor: 1, currency: 'EGP' },
            { account: 'revenue:fee_recovery', direction: 'credit', amountMinor: 1, currency: 'EGP' },
          ],
        }),
      ),
      'VALIDATION_FAILED',
    );
  });

  it('refuses to approve a refund once the donation was charged back or parked for review', async () => {
    const { refunds, donations, gateways, paid, db } = await fundedCase();
    const donation = paid[0]!;
    const refund = await refunds.request(donation.donationId, { reason: 'Donor asked for it back' }, { actor: actorOf(USERS.financeA) });
    await donations.handleWebhook(
      'paymob',
      webhook({
        eventId: `chargeback_${donation.receiptNumber}`,
        reference: donation.receiptNumber,
        outcome: 'refunded',
        amountMinor: donation.breakdown.chargedMinor,
        currency: 'EGP',
      }),
    );
    assert.equal((await db.read.donations.byId(donation.donationId))?.status, 'needs_review');
    await rejects(refunds.approve(refund.id, { actor: actorOf(USERS.financeB) }), 'DONATION_NOT_REFUNDABLE');
    assert.equal(gateways.paymob.refunds.length, 0);
    assert.equal((await db.read.refunds.byId(refund.id))?.status, 'requested');
  });

  it('rejects refunds larger than the charge', async () => {
    const { refunds, paid } = await fundedCase();
    await rejects(
      refunds.request(paid[0]!.donationId, { amountMinor: paid[0]!.breakdown.chargedMinor + 1, reason: 'Too much money' }, { actor: actorOf(USERS.financeA) }),
      'REFUND_EXCEEDS_DONATION',
    );
  });
});
