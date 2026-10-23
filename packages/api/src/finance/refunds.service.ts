/**
 * Refunds with maker-checker control. The refund is sent to the provider only after a
 * second officer approves it; the ledger entry reverses the case credit in proportion
 * (the gateway keeps its original fee, which stays expensed), and a refund can never
 * take back money that was already disbursed — the case fund would go negative and
 * both the in-memory store and PostgreSQL refuse that.
 */
import { DomainError, buildRefundPostings, type DonationSettlement } from '@yusr/core';
import { primaryRole, requirePermission, type CallContext, type RequestActor } from '../common/actor';
import type { Clock } from '../common/clock';
import type { IdGenerator } from '../common/ids';
import type { Database } from '../db/ports';
import type { DonationRow, RefundRow } from '../db/rows';
import type { RefundCall } from '../payments/gateway';
import type { GatewayRegistry } from '../payments/registry';

export interface RefundsDeps {
  db: Database;
  gateways: GatewayRegistry;
  clock: Clock;
  ids: IdGenerator;
}

function settlementOf(donation: DonationRow): DonationSettlement {
  return {
    caseId: donation.caseId,
    provider: donation.provider,
    currency: donation.currency,
    chargedMinor: donation.chargedMinor,
    feeMinor: donation.feeMinor ?? donation.estimatedFeeMinor,
    caseCurrency: donation.caseCurrency,
    netToCaseMinor: donation.netToCaseMinor,
    fxRate: donation.fxRate,
  };
}

/** How much of a refund comes out of the case fund (the rest reverses the fee recovery). */
export function caseDebitOf(donation: DonationRow, refundMinor: number): number {
  const lines = buildRefundPostings(settlementOf(donation), refundMinor);
  return lines.find((line) => line.account === `liability:case:${donation.caseId}`)?.amountMinor ?? 0;
}

export class RefundsService {
  constructor(private readonly deps: RefundsDeps) {}

  async request(donationId: string, input: { amountMinor?: number; reason: string }, context: CallContext): Promise<RefundRow> {
    const actor = requirePermission(context.actor, 'finance:refunds');
    if (input.reason.trim().length < 5) throw new DomainError('REASON_REQUIRED', 'Explain the refund (5 characters or more)');
    const { db, clock, ids } = this.deps;
    return db.transaction(async (tx) => {
      const donation = await tx.donations.byId(donationId, 'update');
      if (!donation) throw new DomainError('NOT_FOUND', 'Donation not found');
      if (donation.status !== 'succeeded' && donation.status !== 'partially_refunded') {
        throw new DomainError('DONATION_NOT_REFUNDABLE', `Donation is ${donation.status}`);
      }
      const committed = (await tx.refunds.forDonation(donation.id)).filter((row) => row.status !== 'rejected').reduce((sum, row) => sum + row.amountMinor, 0);
      const amountMinor = input.amountMinor ?? donation.chargedMinor - committed;
      if (!Number.isInteger(amountMinor) || amountMinor <= 0 || committed + amountMinor > donation.chargedMinor) {
        throw new DomainError('REFUND_EXCEEDS_DONATION', 'Refund exceeds what was charged', { chargedMinor: donation.chargedMinor, committedMinor: committed });
      }
      const row: RefundRow = {
        id: ids(),
        donationId: donation.id,
        amountMinor,
        reason: input.reason.trim(),
        status: 'requested',
        requestedBy: actor.id,
        approvedBy: null,
        providerRef: null,
        processedAt: null,
        createdAt: clock.now(),
      };
      await tx.refunds.insert(row);
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'refund.requested',
        entityType: 'refund',
        entityId: row.id,
        after: { donationId: donation.id, amountMinor, reason: row.reason },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      return row;
    });
  }

  /**
   * Approves, sends the refund to the provider once, then posts it.
   *
   * The refund moves requested → sending under its row lock before the provider is called, so two
   * approvals (double click, two officers, a retry) can never send it twice — most providers ignore
   * idempotency keys. The provider's reference is saved before the ledger entry is posted; calling
   * approve again on a refund that has one only finishes the posting. A refund left in `sending`
   * without a reference (the provider call failed or timed out) is not sent again: finance checks it
   * with the provider first.
   */
  async approve(refundId: string, context: CallContext): Promise<RefundRow> {
    const actor = requirePermission(context.actor, 'finance:approve');
    const { db, gateways } = this.deps;

    const claimed = await db.transaction(async (tx) => {
      const refund = await tx.refunds.byId(refundId, 'update');
      if (!refund) throw new DomainError('NOT_FOUND', 'Refund not found');
      if (refund.requestedBy === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN', 'A different officer must approve this refund');
      if (refund.status === 'sending' && refund.providerRef) return { refund, send: null };
      if (refund.status !== 'requested') throw new DomainError('VALIDATION_FAILED', `Refund is ${refund.status}`, { status: refund.status });
      const donation = await tx.donations.byId(refund.donationId, 'update');
      if (!donation) throw new DomainError('NOT_FOUND', 'Donation not found');
      // The donation may have changed since the request (chargeback, provider-side refund, review).
      if (donation.status !== 'succeeded' && donation.status !== 'partially_refunded') {
        throw new DomainError('DONATION_NOT_REFUNDABLE', `Donation is ${donation.status}`, { status: donation.status });
      }
      const attempt = await tx.donations.latestAttempt(donation.id);
      // Check the case still holds the money before asking the provider to return it.
      const caseDebit = caseDebitOf(donation, refund.amountMinor);
      const held = (await tx.ledger.caseFund(donation.caseId)).find((fund) => fund.currency === donation.caseCurrency)?.heldMinor ?? 0;
      if (caseDebit > held) {
        throw new DomainError('INSUFFICIENT_CASE_FUNDS', 'This gift was already disbursed; refund it from the operating account instead', {
          heldMinor: held,
          neededMinor: caseDebit,
        });
      }
      await tx.refunds.update(refund.id, { status: 'sending', approvedBy: actor.id });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'refund.approved',
        entityType: 'refund',
        entityId: refund.id,
        before: { status: 'requested' },
        after: { status: 'sending' },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      const call: RefundCall = {
        providerRef: attempt?.providerRef ?? donation.receiptNo,
        reference: donation.receiptNo,
        amountMinor: refund.amountMinor,
        currency: donation.currency,
        reason: refund.reason,
        idempotencyKey: `refund-${refund.id}`,
      };
      return { refund: { ...refund, status: 'sending' as const, approvedBy: actor.id }, send: { provider: donation.provider, call } };
    });

    let refund = claimed.refund;
    if (claimed.send) {
      // Outside any transaction: the row stays in `sending`, so nobody else can send it meanwhile.
      const result = await gateways.get(claimed.send.provider).refund(claimed.send.call);
      refund = await db.transaction(async (tx) => {
        const current = await tx.refunds.byId(refund.id, 'update');
        if (!current || current.status !== 'sending' || current.providerRef) throw new DomainError('VALIDATION_FAILED', 'Refund changed while it was sent');
        await tx.refunds.update(refund.id, { providerRef: result.providerRef });
        return { ...current, providerRef: result.providerRef };
      });
    }
    return this.post(refund.id, actor);
  }

  /** Posts a refund the provider accepted (status `sending` with its reference) and marks it processed. */
  private async post(refundId: string, actor: RequestActor): Promise<RefundRow> {
    const { db, clock } = this.deps;
    return db.transaction(async (tx) => {
      const refund = await tx.refunds.byId(refundId, 'update');
      if (!refund) throw new DomainError('NOT_FOUND', 'Refund not found');
      if (refund.status === 'processed') return refund;
      if (refund.status !== 'sending' || !refund.providerRef)
        throw new DomainError('VALIDATION_FAILED', `Refund is ${refund.status}`, { status: refund.status });
      const providerRef = refund.providerRef;
      const fresh = await tx.donations.byId(refund.donationId, 'update');
      if (!fresh) throw new DomainError('NOT_FOUND', 'Donation not found');
      const lines = buildRefundPostings(settlementOf(fresh), refund.amountMinor);
      await tx.ledger.post({ kind: 'refund', refundId: refund.id, memo: fresh.receiptNo, postedBy: actor.id, lines });

      const processedAt = clock.now();
      await tx.refunds.update(refund.id, { status: 'processed', processedAt });
      const refunded = (await tx.refunds.forDonation(fresh.id))
        .filter((row) => row.status === 'processed' || row.id === refund.id)
        .reduce((sum, row) => sum + row.amountMinor, 0);
      const full = refunded >= fresh.chargedMinor;
      await tx.donations.update(fresh.id, { status: full ? 'refunded' : 'partially_refunded' });

      const caseDebit = lines.find((line) => line.account === `liability:case:${fresh.caseId}`)?.amountMinor ?? 0;
      if (caseDebit > 0) await tx.cases.credit(fresh.caseId, -caseDebit, full ? -1 : 0);
      await tx.outbox.enqueue({
        type: 'refund.processed',
        aggregateId: refund.id,
        payload: { refundId: refund.id, donationId: fresh.id, amountMinor: refund.amountMinor, currency: fresh.currency, locale: fresh.locale },
      });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'refund.processed',
        entityType: 'refund',
        entityId: refund.id,
        before: { status: 'sending' },
        after: { status: 'processed', providerRef },
      });
      return { ...refund, status: 'processed', processedAt };
    });
  }

  async reject(refundId: string, reason: string, context: CallContext): Promise<RefundRow> {
    const actor = requirePermission(context.actor, 'finance:approve');
    if (!reason.trim()) throw new DomainError('REASON_REQUIRED');
    return this.deps.db.transaction(async (tx) => {
      const refund = await tx.refunds.byId(refundId, 'update');
      if (!refund) throw new DomainError('NOT_FOUND', 'Refund not found');
      if (refund.status !== 'requested') throw new DomainError('VALIDATION_FAILED', `Refund is ${refund.status}`);
      await tx.refunds.update(refund.id, { status: 'rejected' });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'refund.rejected',
        entityType: 'refund',
        entityId: refund.id,
        before: { status: 'requested' },
        after: { status: 'rejected', reason },
      });
      return { ...refund, status: 'rejected' };
    });
  }
}
