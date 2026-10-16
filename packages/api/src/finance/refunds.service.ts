/**
 * Refunds with maker-checker control. The refund is sent to the provider only after a
 * second officer approves it; the ledger entry reverses the case credit in proportion
 * (the gateway keeps its original fee, which stays expensed), and a refund can never
 * take back money that was already disbursed — the case fund would go negative and
 * both the in-memory store and PostgreSQL refuse that.
 */
import { DomainError, buildRefundPostings, type DonationSettlement } from '@yusr/core';
import { primaryRole, requirePermission, type CallContext } from '../common/actor';
import type { Clock } from '../common/clock';
import type { IdGenerator } from '../common/ids';
import type { Database } from '../db/ports';
import type { DonationRow, RefundRow } from '../db/rows';
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

  /** Approves, sends the refund to the provider, then posts it. Safe to call again if the provider call failed. */
  async approve(refundId: string, context: CallContext): Promise<RefundRow> {
    const actor = requirePermission(context.actor, 'finance:approve');
    const { db, gateways, clock } = this.deps;

    const { refund, donation, providerRef } = await db.transaction(async (tx) => {
      const refund = await tx.refunds.byId(refundId, 'update');
      if (!refund) throw new DomainError('NOT_FOUND', 'Refund not found');
      if (refund.status !== 'requested' && refund.status !== 'approved') throw new DomainError('VALIDATION_FAILED', `Refund is ${refund.status}`);
      if (refund.requestedBy === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN', 'A different officer must approve this refund');
      const donation = await tx.donations.byId(refund.donationId, 'update');
      if (!donation) throw new DomainError('NOT_FOUND', 'Donation not found');
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
      if (refund.status === 'requested') {
        await tx.refunds.update(refund.id, { status: 'approved', approvedBy: actor.id });
        await tx.audit.record({
          actorId: actor.id,
          actorRole: primaryRole(actor),
          action: 'refund.approved',
          entityType: 'refund',
          entityId: refund.id,
          before: { status: 'requested' },
          after: { status: 'approved' },
        });
      }
      return { refund: { ...refund, status: 'approved' as const, approvedBy: actor.id }, donation, providerRef: attempt?.providerRef ?? donation.receiptNo };
    });

    // The provider call happens outside any transaction; its idempotency key makes a retry safe.
    const result = await gateways.get(donation.provider).refund({
      providerRef,
      reference: donation.receiptNo,
      amountMinor: refund.amountMinor,
      currency: donation.currency,
      reason: refund.reason,
      idempotencyKey: `refund-${refund.id}`,
    });

    return db.transaction(async (tx) => {
      const current = await tx.refunds.byId(refund.id, 'update');
      if (current?.status === 'processed') return current;
      const fresh = await tx.donations.byId(donation.id, 'update');
      if (!fresh) throw new DomainError('NOT_FOUND', 'Donation not found');
      const lines = buildRefundPostings(settlementOf(fresh), refund.amountMinor);
      await tx.ledger.post({ kind: 'refund', refundId: refund.id, memo: fresh.receiptNo, postedBy: actor.id, lines });

      const processedAt = clock.now();
      await tx.refunds.update(refund.id, { status: 'processed', providerRef: result.providerRef, processedAt });
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
        before: { status: 'approved' },
        after: { status: 'processed', providerRef: result.providerRef },
      });
      return { ...refund, status: 'processed', providerRef: result.providerRef, processedAt };
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
