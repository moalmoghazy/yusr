/**
 * Donations: price → create → checkout → webhook → ledger → receipt.
 *
 * Framework-free on purpose. The HTTP routes (http/endpoints) call it, the tests drive it
 * with the in-memory database and fake gateways, and every rule about money lives here
 * or in @yusr/core — never in a route handler.
 *
 * Guarantees
 *  - Idempotent creation: the same Idempotency-Key and body return the same donation
 *    (and the same checkout step); the same key with a different body is refused.
 *  - A webhook is applied at most once (provider + event id are recorded in the same
 *    transaction that posts the money), and only after its signature is verified.
 *  - The charged amount and currency must match what we asked for, or the donation is
 *    parked for review instead of being credited.
 *  - Posting, crediting the case and reaching "funded" happen in one transaction, and
 *    notifications leave through the outbox only if that transaction commits.
 */
import {
  DomainError,
  METHOD_META,
  assertDonationAllowed,
  remainingInCurrency,
  buildDonationPostings,
  buildPlatformFeePostings,
  computeDonationBreakdown,
  formatReceiptNumber,
  hasPermission,
  isStaff,
  type CaseStatus,
  type CheckoutAction,
  type CheckoutFlow,
  type CreateDonationRequest,
  type CreateDonationResponse,
  type Currency,
  type DonationBreakdown,
  type DonationReceipt,
  type DonationStatus,
  type FeePolicy,
  type FeeSchedule,
  type LiveDonation,
  type PaymentProvider,
} from '@yusr/core';
import { primaryRole, requirePermission, type CallContext, type RequestActor } from '../common/actor';
import type { Clock } from '../common/clock';
import { canonicalJson, hmacHex, safeEqual, sha256Hex } from '../common/crypto';
import type { IdGenerator } from '../common/ids';
import type { Database, Tx } from '../db/ports';
import type { CaseRow, DonationRow } from '../db/rows';
import type { FxProvider } from '../payments/fx';
import type { CheckoutResult, PaymentEvent, PaymentOutcome, WebhookInput } from '../payments/gateway';
import type { GatewayRegistry } from '../payments/registry';

export interface DonationsConfig {
  /** Public base URL of this API, used for webhook notification URLs. */
  publicApiUrl: string;
  /** Public base URL of the website, used for the default return URL. */
  publicWebUrl: string;
  /** Hosts (and the app scheme) a client-supplied return URL may point to. */
  allowedReturnHosts: readonly string[];
  appScheme: string;
  /** Secret for receipt tokens that let guests open their receipt without an account. */
  receiptSecret: string;
  feePolicy: FeePolicy;
  feeSchedule?: FeeSchedule;
  /** How long a checkout stays payable, per flow. */
  checkoutWindowMs: Readonly<Record<CheckoutFlow, number>>;
}

export const DEFAULT_CHECKOUT_WINDOWS: Readonly<Record<CheckoutFlow, number>> = {
  hosted: 30 * 60_000,
  native_sheet: 30 * 60_000,
  wallet: 30 * 60_000,
  reference: 72 * 3_600_000,
  bank_transfer: 48 * 3_600_000,
};

export interface DonationsDeps {
  db: Database;
  gateways: GatewayRegistry;
  fx: FxProvider;
  clock: Clock;
  ids: IdGenerator;
  config: DonationsConfig;
}

export type WebhookResult =
  | { status: 'processed'; donationId: string; donationStatus: DonationStatus; caseFunded: boolean }
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: 'unknown_reference' | 'provider_mismatch' | 'already_final' };

interface Settlement {
  amountMinor: number;
  currency: Currency;
  feeMinor: number | null;
  providerRef: string | null;
}

const SETTLED: readonly DonationStatus[] = ['succeeded', 'refunded', 'partially_refunded'];
const OPEN: readonly DonationStatus[] = ['pending', 'requires_action', 'awaiting_transfer'];
/** A bank transfer can be confirmed while it is awaited, or after its window passed (late transfers). */
const TRANSFER_CONFIRMABLE: readonly DonationStatus[] = ['awaiting_transfer', 'expired'];
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

export class DonationsService {
  constructor(private readonly deps: DonationsDeps) {}

  // ------------------------------------------------------------------ pricing
  /** The same numbers the donate sheet shows before paying. */
  quote(input: Pick<CreateDonationRequest, 'amountMinor' | 'currency' | 'method' | 'coverFees'>, caseCurrency: Currency): DonationBreakdown {
    return computeDonationBreakdown({
      ...input,
      caseCurrency,
      // A cross-currency gift locks a rate, so it needs a current table.
      fx: input.currency === caseCurrency ? this.deps.fx.current() : this.deps.fx.forConversion(),
      feeSchedule: this.deps.config.feeSchedule,
      feePolicy: this.deps.config.feePolicy,
    });
  }

  /** Quote for a specific case (the donate sheet calls this as the donor types). */
  async quoteForCase(caseId: string, input: Pick<CreateDonationRequest, 'amountMinor' | 'currency' | 'method' | 'coverFees'>): Promise<DonationBreakdown> {
    const item = await this.deps.db.read.cases.byId(caseId);
    if (!item || item.status !== 'published') throw new DomainError('CASE_NOT_DONATABLE', 'Case is not accepting donations');
    return this.quote(input, item.currency);
  }

  /** The public "giving now" ticker: first name and initial only, nothing for anonymous gifts. */
  async live(limit = 12): Promise<LiveDonation[]> {
    const { db } = this.deps;
    const rows = await db.read.donations.list({ status: 'succeeded', limit: Math.min(limit, 50) });
    const result: LiveDonation[] = [];
    for (const row of rows) {
      const item = await db.read.cases.byId(row.caseId);
      if (!item) continue;
      let displayName: LiveDonation['displayName'] = null;
      if (!row.anonymous) {
        const full = row.donorId ? ((await db.read.users.byId(row.donorId))?.displayName ?? null) : (row.guestContact?.name ?? null);
        if (full) {
          const [first, second] = full.trim().split(/\s+/);
          const short = second ? `${first} ${second.slice(0, 1)}.` : (first ?? full);
          displayName = { ar: short, en: short };
        }
      }
      result.push({
        id: row.id,
        at: (row.succeededAt ?? row.createdAt).toISOString(),
        displayName,
        amountMinor: row.netToCaseMinor,
        currency: row.caseCurrency,
        caseSlug: item.slug,
        caseTitle: item.title,
        region: item.region,
      });
    }
    return result;
  }

  // ------------------------------------------------------------------ create
  async create(request: CreateDonationRequest, context: CallContext & { idempotencyKey: string }): Promise<CreateDonationResponse> {
    const { db, clock, ids } = this.deps;
    const key = context.idempotencyKey.trim();
    if (!IDEMPOTENCY_KEY.test(key)) {
      throw new DomainError('VALIDATION_FAILED', 'Idempotency-Key must be 16–128 URL-safe characters', { field: 'Idempotency-Key' });
    }
    const requestHash = sha256Hex(canonicalJson({ request, actor: context.actor?.id ?? null }));

    const existing = await db.read.donations.byIdempotencyKey(key);
    if (existing) return this.replay(existing, requestHash);

    const item = await db.read.cases.byId(request.caseId);
    if (!item) throw new DomainError('NOT_FOUND', 'Case not found', { caseId: request.caseId });
    const actor = context.actor;
    assertDonationAllowed(request, {
      caseStatus: item.status,
      caseZakatEligible: item.zakatEligible,
      isGuest: !actor,
      remainingMinor: remainingInCurrency(item, request.currency, this.deps.fx.current()),
    });
    if (!actor && !request.donor?.email && !request.donor?.phone) {
      throw new DomainError('VALIDATION_FAILED', 'Guests need an email or a mobile number for the receipt', { field: 'donor' });
    }

    const breakdown = this.quote(request, item.currency);
    const now = clock.now();
    const expiresAt = new Date(now.getTime() + this.deps.config.checkoutWindowMs[METHOD_META[request.method].flow]);
    const id = ids();
    const returnUrl = this.returnUrl(request.returnUrl ?? null, request.locale, id);

    const donation = await db.transaction(async (tx) => {
      const raced = await tx.donations.byIdempotencyKey(key);
      if (raced) return raced;
      const sequence = await tx.donations.nextReceiptSequence(now.getUTCFullYear());
      const row: DonationRow = {
        id,
        caseId: item.id,
        donorId: actor?.id ?? null,
        guestContact: actor ? null : { name: request.donor?.name?.trim() || null, email: request.donor?.email ?? null, phone: request.donor?.phone ?? null },
        idempotencyKey: key,
        requestHash,
        type: request.type,
        anonymous: request.anonymous,
        dedication: request.dedication?.trim() || null,
        currency: request.currency,
        amountMinor: breakdown.amountMinor,
        coverFees: request.coverFees,
        estimatedFeeMinor: breakdown.estimatedFeeMinor,
        feeMinor: null,
        chargedMinor: breakdown.chargedMinor,
        caseCurrency: breakdown.caseCurrency,
        fxRate: breakdown.fxRate,
        netToCaseMinor: breakdown.netToCaseMinor,
        method: request.method,
        provider: breakdown.provider,
        status: 'pending',
        receiptNo: formatReceiptNumber(now.getUTCFullYear(), sequence),
        receiptTokenHash: sha256Hex(this.receiptToken(id)),
        locale: request.locale,
        channel: context.channel ?? 'web',
        expiresAt,
        succeededAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await tx.donations.insert(row);
      return row;
    });

    if (donation.id !== id) return this.replay(donation, requestHash);
    return this.startCheckout(donation, item, returnUrl);
  }

  private async replay(donation: DonationRow, requestHash: string): Promise<CreateDonationResponse> {
    if (donation.requestHash !== requestHash) {
      throw new DomainError('IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was used for a different donation');
    }
    const attempt = await this.deps.db.read.donations.latestAttempt(donation.id);
    if (attempt?.action && attempt.status !== 'failed') return this.response(donation, attempt.action);
    if (!OPEN.includes(donation.status)) return this.response(donation, { type: 'none' });
    // The first call reached us but not the provider: try the checkout again.
    const item = await this.deps.db.read.cases.byId(donation.caseId);
    if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
    return this.startCheckout(donation, item, this.returnUrl(null, donation.locale, donation.id));
  }

  private async startCheckout(donation: DonationRow, item: CaseRow, returnUrl: string): Promise<CreateDonationResponse> {
    const { db, gateways, clock, ids, config } = this.deps;
    const gateway = gateways.get(donation.provider);
    const contact = donation.guestContact ?? (donation.donorId ? await this.contactFor(donation.donorId) : null);
    let result: CheckoutResult;
    try {
      result = await gateway.createCheckout({
        donationId: donation.id,
        reference: donation.receiptNo,
        method: donation.method,
        currency: donation.currency,
        amountMinor: donation.chargedMinor,
        description: `${donation.locale === 'ar' ? 'تبرع لحالة' : 'Donation to case'} ${item.reference}`,
        customer: contact ?? { name: null, email: null, phone: null },
        locale: donation.locale,
        returnUrl,
        notificationUrl: `${config.publicApiUrl.replace(/\/$/, '')}/v1/webhooks/${donation.provider}`,
        expiresAt: donation.expiresAt,
        idempotencyKey: `checkout-${donation.id}`,
      });
    } catch (error) {
      await db.transaction(async (tx) => {
        await tx.donations.insertAttempt({
          id: ids(),
          donationId: donation.id,
          provider: donation.provider,
          providerRef: null,
          providerOrderRef: null,
          status: 'failed',
          amountMinor: donation.chargedMinor,
          currency: donation.currency,
          action: null,
          failureCode: DomainError.is(error) ? error.code : 'PROVIDER_UNREACHABLE',
          createdAt: clock.now(),
        });
      });
      throw error;
    }

    const updated = await db.transaction(async (tx) => {
      await tx.donations.insertAttempt({
        id: ids(),
        donationId: donation.id,
        provider: donation.provider,
        providerRef: result.providerRef,
        providerOrderRef: result.providerOrderRef ?? null,
        status: 'action_required',
        amountMinor: donation.chargedMinor,
        currency: donation.currency,
        action: result.action,
        failureCode: null,
        createdAt: clock.now(),
      });
      const current = await tx.donations.byId(donation.id, 'update');
      // A very fast webhook may already have settled it; never move a donation backwards.
      if (current && OPEN.includes(current.status)) await tx.donations.update(donation.id, { status: result.status });
      return (await tx.donations.byId(donation.id)) ?? donation;
    });
    return this.response(updated, result.action);
  }

  private async contactFor(userId: string) {
    const user = await this.deps.db.read.users.byId(userId);
    return user ? { name: user.displayName, email: user.email, phone: user.phone } : null;
  }

  private response(donation: DonationRow, action: CheckoutAction): CreateDonationResponse {
    return {
      donationId: donation.id,
      status: donation.status,
      receiptNumber: donation.receiptNo,
      receiptToken: this.receiptToken(donation.id),
      breakdown: this.breakdownOf(donation),
      action,
    };
  }

  // ------------------------------------------------------------------ webhooks
  async handleWebhook(provider: PaymentProvider, input: WebhookInput): Promise<WebhookResult> {
    const { db, gateways, clock, ids } = this.deps;
    // Signature first: nothing from an unverified body is stored or trusted.
    const event = await gateways.get(provider).parseWebhook(input);
    const now = clock.now();
    return db.transaction(async (tx) => {
      const fresh = await tx.webhooks.record({
        id: ids(),
        provider,
        eventId: event.eventId,
        signatureValid: true,
        payload: event.payload,
        receivedAt: now,
        processedAt: null,
        error: null,
      });
      if (!fresh) return { status: 'duplicate' } as const;

      const donation = await this.donationFor(tx, provider, event);
      if (!donation) {
        await tx.webhooks.finish(provider, event.eventId, 'unknown reference', now);
        return { status: 'ignored', reason: 'unknown_reference' } as const;
      }
      if (donation.provider !== provider) {
        await tx.webhooks.finish(provider, event.eventId, 'provider mismatch', now);
        return { status: 'ignored', reason: 'provider_mismatch' } as const;
      }

      const result = await this.apply(
        tx,
        donation,
        event.outcome,
        {
          amountMinor: event.amountMinor,
          currency: event.currency,
          feeMinor: event.feeMinor,
          providerRef: event.providerRef,
        },
        event.failureCode,
      );
      await tx.webhooks.finish(provider, event.eventId, null, now);
      return result;
    });
  }

  /** The donation an event is about: by the provider order stored at checkout when the gateway gives one, else by receipt number. */
  private async donationFor(tx: Tx, provider: PaymentProvider, event: PaymentEvent): Promise<DonationRow | null> {
    if (event.providerOrderRef === undefined) return tx.donations.byReceipt(event.reference, 'update');
    const attempt = await tx.donations.attemptByOrderRef(provider, event.providerOrderRef);
    return attempt ? tx.donations.byId(attempt.donationId, 'update') : null;
  }

  private async apply(tx: Tx, donation: DonationRow, outcome: PaymentOutcome, payment: Settlement, failureCode: string | null): Promise<WebhookResult> {
    const now = this.deps.clock.now();
    switch (outcome) {
      case 'succeeded':
        return this.settle(tx, donation, payment, null);
      case 'pending':
        if (donation.status === 'pending') await tx.donations.update(donation.id, { status: 'requires_action' });
        return {
          status: 'processed',
          donationId: donation.id,
          donationStatus: donation.status === 'pending' ? 'requires_action' : donation.status,
          caseFunded: false,
        };
      case 'failed':
      case 'expired': {
        if (!OPEN.includes(donation.status)) return { status: 'ignored', reason: 'already_final' };
        const status: DonationStatus = outcome === 'failed' ? 'failed' : 'expired';
        await tx.donations.update(donation.id, { status });
        await this.markAttempt(tx, donation.id, { status: 'failed', failureCode: failureCode ?? outcome });
        await tx.outbox.enqueue({
          type: `donation.${status}`,
          aggregateId: donation.id,
          payload: { donationId: donation.id, caseId: donation.caseId, receiptNo: donation.receiptNo, locale: donation.locale },
        });
        return { status: 'processed', donationId: donation.id, donationStatus: status, caseFunded: false };
      }
      case 'refunded': {
        // Refunds we start are recorded by the refunds service. A refund started on the provider's side
        // (dashboard, dispute) is parked for finance so the ledger is corrected deliberately.
        if (donation.status !== 'succeeded') return { status: 'ignored', reason: 'already_final' };
        await tx.donations.update(donation.id, { status: 'needs_review' });
        await tx.outbox.enqueue({
          type: 'finance.review_needed',
          aggregateId: donation.id,
          payload: { donationId: donation.id, reason: 'provider_refund', at: now.toISOString() },
        });
        await tx.audit.record({
          actorId: null,
          actorRole: null,
          action: 'donation.needs_review',
          entityType: 'donation',
          entityId: donation.id,
          before: { status: donation.status },
          after: { status: 'needs_review', reason: 'provider_refund' },
        });
        return { status: 'processed', donationId: donation.id, donationStatus: 'needs_review', caseFunded: false };
      }
    }
  }

  /** Credits a paid donation: ledger entry, case totals, funded transition and notifications, atomically. */
  private async settle(tx: Tx, donation: DonationRow, payment: Settlement, actor: RequestActor | null): Promise<WebhookResult> {
    if (SETTLED.includes(donation.status)) return { status: 'ignored', reason: 'already_final' };
    const now = this.deps.clock.now();

    if (payment.currency !== donation.currency || payment.amountMinor !== donation.chargedMinor) {
      await tx.donations.update(donation.id, { status: 'needs_review' });
      await tx.outbox.enqueue({
        type: 'finance.review_needed',
        aggregateId: donation.id,
        payload: {
          donationId: donation.id,
          reason: 'amount_mismatch',
          expected: { amountMinor: donation.chargedMinor, currency: donation.currency },
          received: { amountMinor: payment.amountMinor, currency: payment.currency },
        },
      });
      await tx.audit.record({
        actorId: null,
        actorRole: null,
        action: 'donation.needs_review',
        entityType: 'donation',
        entityId: donation.id,
        before: { status: donation.status },
        after: { status: 'needs_review', reason: 'amount_mismatch', receivedMinor: payment.amountMinor },
      });
      return { status: 'processed', donationId: donation.id, donationStatus: 'needs_review', caseFunded: false };
    }

    const feeMinor = payment.feeMinor ?? donation.estimatedFeeMinor;
    const netToCaseMinor = this.netAfterActualFee(donation, feeMinor);
    const lines = buildDonationPostings({
      caseId: donation.caseId,
      provider: donation.provider,
      currency: donation.currency,
      chargedMinor: donation.chargedMinor,
      feeMinor,
      caseCurrency: donation.caseCurrency,
      netToCaseMinor,
      fxRate: donation.fxRate,
    });
    await tx.ledger.ensureCaseFund(donation.caseId, donation.caseCurrency);
    await tx.ledger.post({ kind: 'donation', donationId: donation.id, memo: donation.receiptNo, postedBy: actor?.id ?? null, lines });
    await tx.donations.update(donation.id, { status: 'succeeded', feeMinor, netToCaseMinor, succeededAt: now });
    await this.markAttempt(tx, donation.id, { status: 'captured', providerRef: payment.providerRef });

    const totals = await tx.cases.credit(donation.caseId, netToCaseMinor, 1);
    await tx.outbox.enqueue({
      type: 'donation.succeeded',
      aggregateId: donation.id,
      payload: {
        donationId: donation.id,
        caseId: donation.caseId,
        receiptNo: donation.receiptNo,
        donorId: donation.donorId,
        amountMinor: netToCaseMinor,
        currency: donation.caseCurrency,
        anonymous: donation.anonymous,
        locale: donation.locale,
      },
    });

    let caseFunded = false;
    if (totals.status === 'published' && totals.raisedMinor >= totals.goalMinor) {
      await this.markFunded(tx, donation.caseId, totals.raisedMinor, totals.goalMinor);
      caseFunded = true;
    }
    return { status: 'processed', donationId: donation.id, donationStatus: 'succeeded', caseFunded };
  }

  private async markFunded(tx: Tx, caseId: string, raisedMinor: number, goalMinor: number): Promise<void> {
    const from: CaseStatus = 'published';
    await tx.cases.setStatus(caseId, 'funded', { system: true });
    await tx.cases.insertTransition({ caseId, fromStatus: from, toStatus: 'funded', actorId: null, reason: null });
    await tx.audit.record({
      actorId: null,
      actorRole: null,
      action: 'case.funded',
      entityType: 'case',
      entityId: caseId,
      before: { status: from },
      after: { status: 'funded', raisedMinor },
    });
    await tx.outbox.enqueue({ type: 'case.funded', aggregateId: caseId, payload: { caseId, raisedMinor, goalMinor } });
    // Yusr's 10% leaves the case fund once the case is funded; the rest is paid to the payees.
    const item = await tx.cases.byId(caseId);
    if (item && item.platformFeeMinor > 0) {
      await tx.ledger.post({
        kind: 'platform_fee',
        memo: item.reference,
        postedBy: null,
        lines: buildPlatformFeePostings(caseId, item.platformFeeMinor, item.currency),
      });
    }
  }

  /** When the case absorbs fees and the donor did not cover them, the credit follows the fee actually charged. */
  private netAfterActualFee(donation: DonationRow, feeMinor: number): number {
    if (donation.coverFees || this.deps.config.feePolicy === 'platform_absorbs') return donation.netToCaseMinor;
    const netInChargeCurrency = Math.max(0, donation.amountMinor - feeMinor);
    return donation.currency === donation.caseCurrency ? netInChargeCurrency : Math.round(netInChargeCurrency * donation.fxRate);
  }

  private async markAttempt(tx: Tx, donationId: string, patch: { status: 'captured' | 'failed'; providerRef?: string | null; failureCode?: string }) {
    const attempt = await tx.donations.latestAttempt(donationId);
    if (!attempt) return;
    await tx.donations.updateAttempt(attempt.id, {
      status: patch.status,
      ...(patch.providerRef ? { providerRef: patch.providerRef } : {}),
      ...(patch.failureCode ? { failureCode: patch.failureCode } : {}),
    });
  }

  // ------------------------------------------------------------------ manual reconciliation (InstaPay)
  async confirmTransfer(donationId: string, input: { bankReference: string; receivedMinor: number }, context: CallContext): Promise<DonationReceipt> {
    const actor = requirePermission(context.actor, 'finance:reconcile');
    const { db } = this.deps;
    await db.transaction(async (tx) => {
      const donation = await tx.donations.byId(donationId, 'update');
      if (!donation) throw new DomainError('NOT_FOUND', 'Donation not found');
      // Only bank transfers are confirmed by hand. Gateway payments are settled by their verified
      // webhooks, and a donation parked for review is not settled by a single officer.
      if (donation.provider !== 'instapay') {
        throw new DomainError('VALIDATION_FAILED', 'Only bank transfers are confirmed by hand', { method: donation.method });
      }
      if (!TRANSFER_CONFIRMABLE.includes(donation.status)) {
        throw new DomainError('VALIDATION_FAILED', `Donation is ${donation.status}, not awaiting a transfer`, { status: donation.status });
      }
      // One bank statement line pays one donation (payment_attempts_ref keeps it unique per provider).
      const bankReference = input.bankReference.trim();
      const used = await tx.donations.attemptByProviderRef(donation.provider, bankReference);
      if (used && used.donationId !== donation.id) {
        throw new DomainError('VALIDATION_FAILED', 'This bank reference was already matched to another donation', { field: 'bankReference' });
      }
      if (input.receivedMinor !== donation.chargedMinor) {
        throw new DomainError('AMOUNT_MISMATCH', 'Received amount differs from the donation', {
          expectedMinor: donation.chargedMinor,
          receivedMinor: input.receivedMinor,
        });
      }
      const result = await this.settle(
        tx,
        donation,
        { amountMinor: input.receivedMinor, currency: donation.currency, feeMinor: 0, providerRef: bankReference },
        actor,
      );
      if (result.status !== 'processed' || result.donationStatus !== 'succeeded') {
        throw new DomainError('VALIDATION_FAILED', 'Transfer could not be applied');
      }
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'donation.transfer_confirmed',
        entityType: 'donation',
        entityId: donation.id,
        before: { status: donation.status },
        after: { status: 'succeeded', bankReference },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
    });
    return this.receipt(donationId, { actor: context.actor, token: null });
  }

  // ------------------------------------------------------------------ receipts & housekeeping
  /** Donor, finance staff, or anyone holding the receipt token may read a receipt. */
  async receipt(donationId: string, access: { actor: RequestActor | null; token: string | null }): Promise<DonationReceipt> {
    const { db } = this.deps;
    const donation = await db.read.donations.byId(donationId);
    const allowed =
      donation &&
      ((access.actor && (access.actor.id === donation.donorId || this.isFinanceReader(access.actor))) ||
        (access.token !== null && safeEqual(this.receiptToken(donation.id), access.token)));
    // Unknown and forbidden look the same, so ids cannot be probed.
    if (!donation || !allowed) throw new DomainError('NOT_FOUND', 'Donation not found');
    const item = await db.read.cases.byId(donation.caseId);
    if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
    return this.toReceipt(donation, item);
  }

  /** Same rule as requirePermission(actor, 'finance:read'): staff also need a second-factor session. */
  private isFinanceReader(actor: RequestActor): boolean {
    return hasPermission(actor.roles, 'finance:read') && (!isStaff(actor.roles) || actor.mfa);
  }

  async listForDonor(actor: RequestActor, limit = 50): Promise<DonationReceipt[]> {
    const rows = await this.deps.db.read.donations.forDonor(actor.id, Math.min(limit, 100));
    const receipts: DonationReceipt[] = [];
    for (const row of rows) {
      const item = await this.deps.db.read.cases.byId(row.caseId);
      if (item) receipts.push(this.toReceipt(row, item));
    }
    return receipts;
  }

  /** Expires checkouts nobody completed. Runs every few minutes from the worker. */
  async expireStale(limit = 200): Promise<number> {
    const { db, clock } = this.deps;
    const now = clock.now();
    const stale = await db.read.donations.expirable(now, limit);
    let expired = 0;
    for (const candidate of stale) {
      const changed = await db.transaction(async (tx) => {
        const donation = await tx.donations.byId(candidate.id, 'update');
        if (!donation || !OPEN.includes(donation.status) || donation.expiresAt >= now) return false;
        await tx.donations.update(donation.id, { status: 'expired' });
        await tx.outbox.enqueue({
          type: 'donation.expired',
          aggregateId: donation.id,
          payload: { donationId: donation.id, caseId: donation.caseId, receiptNo: donation.receiptNo, locale: donation.locale },
        });
        return true;
      });
      if (changed) expired += 1;
    }
    return expired;
  }

  receiptToken(donationId: string): string {
    return hmacHex('sha256', this.deps.config.receiptSecret, `receipt:${donationId}`).slice(0, 40);
  }

  private returnUrl(requested: string | null, locale: string, donationId: string): string {
    const params = `donation=${encodeURIComponent(donationId)}&token=${this.receiptToken(donationId)}`;
    if (!requested) return `${this.deps.config.publicWebUrl.replace(/\/$/, '')}/${locale}/receipt?${params}`;
    let url: URL;
    try {
      url = new URL(requested);
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'returnUrl is not a valid URL', { field: 'returnUrl' });
    }
    const appLink = url.protocol === `${this.deps.config.appScheme}:`;
    const allowedHost = (url.protocol === 'https:' || url.hostname === 'localhost') && this.deps.config.allowedReturnHosts.includes(url.host);
    if (!appLink && !allowedHost) throw new DomainError('VALIDATION_FAILED', 'returnUrl host is not allowed', { field: 'returnUrl' });
    return `${url.toString()}${url.search ? '&' : '?'}${params}`;
  }

  private breakdownOf(donation: DonationRow): DonationBreakdown {
    return {
      provider: donation.provider,
      currency: donation.currency,
      amountMinor: donation.amountMinor,
      chargedMinor: donation.chargedMinor,
      estimatedFeeMinor: donation.estimatedFeeMinor,
      donorCoveredFeeMinor: donation.chargedMinor - donation.amountMinor,
      caseCurrency: donation.caseCurrency,
      netToCaseMinor: donation.netToCaseMinor,
      fxRate: donation.fxRate,
    };
  }

  toReceipt(donation: DonationRow, item: CaseRow): DonationReceipt {
    return {
      id: donation.id,
      receiptNumber: donation.receiptNo,
      status: donation.status,
      caseId: item.id,
      caseSlug: item.slug,
      caseTitle: item.title,
      type: donation.type,
      anonymous: donation.anonymous,
      dedication: donation.dedication,
      method: donation.method,
      provider: donation.provider,
      currency: donation.currency,
      amountMinor: donation.amountMinor,
      chargedMinor: donation.chargedMinor,
      feeMinor: donation.feeMinor ?? donation.estimatedFeeMinor,
      caseCurrency: donation.caseCurrency,
      netToCaseMinor: donation.netToCaseMinor,
      createdAt: donation.createdAt.toISOString(),
      succeededAt: donation.succeededAt ? donation.succeededAt.toISOString() : null,
    };
  }
}

export const DONATIONS_CONFIG = Symbol('DONATIONS_CONFIG');
