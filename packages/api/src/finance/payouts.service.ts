/**
 * Disbursements with maker-checker control: one financial officer requests a payout
 * against a line of the case's disbursement plan, a different officer approves it,
 * and only then can it be marked paid — which posts the ledger entry and tells the
 * case's donors that their money reached the hospital, school or creditor.
 */
import { DomainError, buildPayoutPostings, randomCode, type CaseStatus } from '@yusr/core';
import { primaryRole, requirePermission, type CallContext } from '../common/actor';
import type { Clock } from '../common/clock';
import { mask } from '../common/crypto';
import type { IdGenerator } from '../common/ids';
import type { Database, Tx } from '../db/ports';
import type { PayoutRow } from '../db/rows';
import { caseDebitOf } from './refunds.service';

export interface PayoutsDeps {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
}

const PAYABLE: readonly CaseStatus[] = ['published', 'paused', 'funded'];
const ACTIVE: readonly PayoutRow['status'][] = ['requested', 'approved', 'paid'];

export class PayoutsService {
  constructor(private readonly deps: PayoutsDeps) {}

  async request(input: { caseId: string; lineId: string; amountMinor?: number; payeeAccount?: string | null }, context: CallContext): Promise<PayoutRow> {
    const actor = requirePermission(context.actor, 'finance:payouts');
    if (input.amountMinor !== undefined && (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'amountMinor must be a positive integer', { field: 'amountMinor' });
    }
    const { db, clock, ids } = this.deps;
    return db.transaction(async (tx) => {
      const item = await tx.cases.byId(input.caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (!PAYABLE.includes(item.status)) throw new DomainError('VALIDATION_FAILED', `Payouts are not allowed while a case is ${item.status}`);
      const line = await tx.cases.line(input.lineId);
      if (!line || line.caseId !== item.id) throw new DomainError('NOT_FOUND', 'Disbursement line not found');

      const payouts = await tx.payouts.forCase(item.id);
      const againstLine = payouts.filter((row) => row.lineId === line.id && ACTIVE.includes(row.status)).reduce((sum, row) => sum + row.amountMinor, 0);
      // Without an amount, the payout settles what is left of the plan line.
      const amountMinor = input.amountMinor ?? line.amountMinor - againstLine;
      const account = input.payeeAccount ? mask(input.payeeAccount.replace(/\s+/g, '')) : line.payeeAccountMasked;
      if (!account) throw new DomainError('VALIDATION_FAILED', 'Add the payee bank account to the plan line first', { field: 'payeeAccount' });
      if (amountMinor <= 0 || againstLine + amountMinor > line.amountMinor) {
        throw new DomainError('VALIDATION_FAILED', 'Payout exceeds what the plan allows for this line', {
          lineMinor: line.amountMinor,
          alreadyMinor: againstLine,
        });
      }
      const available = await this.availableMinor(tx, item.id, item.currency);
      if (amountMinor > available) {
        throw new DomainError('INSUFFICIENT_CASE_FUNDS', 'Not enough held for this case', { availableMinor: available });
      }

      const row: PayoutRow = {
        id: ids(),
        reference: `PO-${randomCode(6)}`,
        caseId: item.id,
        lineId: line.id,
        amountMinor,
        currency: item.currency,
        payeeAccountMasked: account,
        status: 'requested',
        requestedBy: actor.id,
        approvedBy: null,
        approvedAt: null,
        paidAt: null,
        bankReference: null,
        proofDocumentId: null,
        createdAt: clock.now(),
      };
      await tx.payouts.insert(row);
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'payout.requested',
        entityType: 'payout',
        entityId: row.id,
        after: { amountMinor: row.amountMinor, lineId: line.id, caseId: item.id },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      return row;
    });
  }

  /** Held for the case minus payouts and approved refunds that have not left yet. */
  private async availableMinor(tx: Tx, caseId: string, currency: PayoutRow['currency']): Promise<number> {
    const held = (await tx.ledger.caseFund(caseId)).find((fund) => fund.currency === currency)?.heldMinor ?? 0;
    const pendingPayouts = (await tx.payouts.forCase(caseId))
      .filter((row) => row.status === 'requested' || row.status === 'approved')
      .reduce((sum, row) => sum + row.amountMinor, 0);
    let pendingRefunds = 0;
    for (const refund of await tx.refunds.list({ status: 'approved' })) {
      const donation = await tx.donations.byId(refund.donationId);
      if (donation?.caseId === caseId) pendingRefunds += caseDebitOf(donation, refund.amountMinor);
    }
    return held - pendingPayouts - pendingRefunds;
  }

  async approve(payoutId: string, context: CallContext): Promise<PayoutRow> {
    const actor = requirePermission(context.actor, 'finance:approve');
    const { db, clock } = this.deps;
    return db.transaction(async (tx) => {
      const payout = await tx.payouts.byId(payoutId, 'update');
      if (!payout) throw new DomainError('NOT_FOUND', 'Payout not found');
      if (payout.status !== 'requested') throw new DomainError('VALIDATION_FAILED', `Payout is ${payout.status}`);
      if (payout.requestedBy === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN', 'A different officer must approve this payout');
      const approvedAt = clock.now();
      await tx.payouts.update(payout.id, { status: 'approved', approvedBy: actor.id, approvedAt });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'payout.approved',
        entityType: 'payout',
        entityId: payout.id,
        before: { status: 'requested' },
        after: { status: 'approved' },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      return { ...payout, status: 'approved', approvedBy: actor.id, approvedAt };
    });
  }

  async reject(payoutId: string, reason: string, context: CallContext): Promise<PayoutRow> {
    const actor = requirePermission(context.actor, 'finance:approve');
    if (!reason.trim()) throw new DomainError('REASON_REQUIRED');
    return this.deps.db.transaction(async (tx) => {
      const payout = await tx.payouts.byId(payoutId, 'update');
      if (!payout) throw new DomainError('NOT_FOUND', 'Payout not found');
      if (payout.status !== 'requested' && payout.status !== 'approved') throw new DomainError('VALIDATION_FAILED', `Payout is ${payout.status}`);
      await tx.payouts.update(payout.id, { status: 'rejected' });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'payout.rejected',
        entityType: 'payout',
        entityId: payout.id,
        before: { status: payout.status },
        after: { status: 'rejected', reason },
      });
      return { ...payout, status: 'rejected' };
    });
  }

  /** Records the bank transfer and posts it to the ledger (which refuses to overdraw the case fund). */
  async markPaid(payoutId: string, input: { bankReference: string; proofDocumentId?: string | null }, context: CallContext): Promise<PayoutRow> {
    const actor = requirePermission(context.actor, 'finance:payouts');
    if (input.bankReference.trim().length < 4) throw new DomainError('VALIDATION_FAILED', 'bankReference is required', { field: 'bankReference' });
    const { db, clock } = this.deps;
    return db.transaction(async (tx) => {
      const payout = await tx.payouts.byId(payoutId, 'update');
      if (!payout) throw new DomainError('NOT_FOUND', 'Payout not found');
      if (payout.status !== 'approved') throw new DomainError('VALIDATION_FAILED', `Only approved payouts can be paid (this one is ${payout.status})`);
      const paidAt = clock.now();
      await tx.ledger.ensureCaseFund(payout.caseId, payout.currency);
      await tx.ledger.post({
        kind: 'payout',
        payoutId: payout.id,
        memo: payout.reference,
        postedBy: actor.id,
        lines: buildPayoutPostings(payout.caseId, payout.amountMinor, payout.currency),
      });
      const patch = { status: 'paid' as const, paidAt, bankReference: input.bankReference.trim(), proofDocumentId: input.proofDocumentId ?? null };
      await tx.payouts.update(payout.id, patch);
      const line = await tx.cases.line(payout.lineId);
      await tx.outbox.enqueue({
        type: 'payout.paid',
        aggregateId: payout.id,
        payload: {
          payoutId: payout.id,
          caseId: payout.caseId,
          amountMinor: payout.amountMinor,
          currency: payout.currency,
          payee: line?.payee ?? null,
          proofDocumentId: patch.proofDocumentId,
        },
      });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'payout.paid',
        entityType: 'payout',
        entityId: payout.id,
        before: { status: 'approved' },
        after: { status: 'paid', bankReference: patch.bankReference },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      return { ...payout, ...patch };
    });
  }
}
