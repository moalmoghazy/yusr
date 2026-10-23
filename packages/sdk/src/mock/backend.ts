/**
 * In-memory Yusr backend implementing the same contract as the real API.
 * It runs the shared domain rules from @yusr/core — lifecycle, RBAC, fees, ledger —
 * so the prototype, previews and tests behave like production, including
 * maker-checker approvals, balanced ledger postings and automatic "funded" transitions.
 */
import {
  ACCOUNTS,
  DEMO_FX,
  DomainError,
  assertDonationAllowed,
  remainingInCurrency,
  assertTransition,
  balanceOf,
  buildDonationPostings,
  buildPayoutPostings,
  buildPlatformFeePostings,
  buildRefundPostings,
  caseAmountsFor,
  caseNeedMinor,
  buildSettlementPostings,
  computeDonationBreakdown,
  convertMinor,
  formatReceiptNumber,
  isPubliclyVisible,
  permissionsFor,
  queryCases,
  toMinor,
  type ActivityItem,
  type Actor,
  type AdminCase,
  type AdminDonation,
  type AdminOverview,
  type AuditEntry,
  type CaseCategory,
  type CaseDetail,
  type CaseFilters,
  type CaseStatus,
  type CaseSummary,
  type CheckoutAction,
  type ChecklistItem,
  type CreateDonationRequest,
  type CreateDonationResponse,
  type Currency,
  type DisbursementLine,
  type DocumentKind,
  type DonationBreakdown,
  type DonorNotification,
  type DonorRow,
  type LedgerKind,
  type LedgerLine,
  type LiveDonation,
  type Localized,
  type Page,
  type PaymentMethod,
  type Payout,
  type Permission,
  type PlatformStats,
  type Posting,
  type PublicDonation,
  type Refund,
  type Role,
  type SubmitCaseRequest,
  type SubmitCaseResult,
  type TeamMember,
  type TimelineEvent,
  type UploadTicket,
  type VerificationTask,
  type VolunteerRow,
} from '@yusr/core';
import { canSeeSentMessages, maskRecipient, type ContactChannel, type SentMessage } from '@yusr/core';
import type { EditCaseInput } from '@yusr/core/schemas';
import type { AdminClient, LedgerQuery, YusrClient } from '../client';
import { demoPartnerFor, SEED_CASES, seedAmounts, type SeedCase } from './cases';
import { CURRENT_DONOR, DONORS, STAFF, VOLUNTEERS, type SeedDonor } from './people';
import { createRandom, type Random } from './random';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ME = CURRENT_DONOR.id;

/** Historical platform totals before the demo window (shown on the landing page). */
const BASELINE = { raisedMinor: 18_240_000_00, casesFunded: 1_274, donors: 46_180 };

const SYSTEM_NAME: Localized = { ar: 'المنصة', en: 'Platform' };
const CONTENT_TEAM: Localized = { ar: 'فريق المحتوى', en: 'Content team' };
/** The partner association: it verifies the case in the field and pays the provider. */
const PARTNER_LABEL: Localized = { ar: 'الجمعية الشريكة', en: 'Partner association' };

const DOCUMENT_TITLES: Record<DocumentKind, Localized> = {
  national_id: { ar: 'بطاقة الرقم القومي', en: 'National ID' },
  medical_report: { ar: 'تقرير طبي', en: 'Medical report' },
  price_quote: { ar: 'عرض سعر', en: 'Price quote' },
  invoice: { ar: 'فاتورة', en: 'Invoice' },
  debt_proof: { ar: 'إثبات مديونية', en: 'Proof of debt' },
  court_ruling: { ar: 'حكم قضائي', en: 'Court ruling' },
  school_record: { ar: 'إفادة دراسية', en: 'School record' },
  field_report: { ar: 'تقرير الزيارة الميدانية', en: 'Field visit report' },
  disbursement_proof: { ar: 'إيصال صرف', en: 'Payment receipt' },
};

export type BackendEvent =
  | { type: 'donation.created'; donation: AdminDonation }
  | { type: 'donation.succeeded'; donation: AdminDonation; live: boolean }
  | { type: 'donation.failed'; donation: AdminDonation }
  | { type: 'case.updated'; caseId: string }
  | { type: 'case.funded'; caseId: string }
  | { type: 'ledger.posted'; lines: LedgerLine[] }
  | { type: 'payout.updated'; payout: Payout }
  | { type: 'refund.updated'; refund: Refund }
  | { type: 'audit.logged'; entry: AuditEntry };

export interface DonationRecord extends AdminDonation {
  userId: string | null;
  donorId: string | null;
  /** Public name; null = anonymous. */
  displayName: Localized | null;
  breakdown: DonationBreakdown;
  region: string;
  action: CheckoutAction;
}

export interface CreateContext {
  userId?: string | null;
  channel?: 'web' | 'mobile';
  donorId?: string | null;
  displayName?: Localized | null;
  region?: string;
  at?: number;
}

export interface MockBackendOptions {
  seed?: number;
  now?: () => number;
  /** Random delay range between simulated live donations (ms). */
  liveIntervalMs?: readonly [number, number];
}

export interface LedgerBalance {
  byCurrency: Array<{ currency: Currency; debitMinor: number; creditMinor: number }>;
  balanced: boolean;
  lines: number;
}

export interface MockBackend {
  read: ReturnType<typeof createReadApi>;
  client: YusrClient;
  admin(actor: Actor): AdminClient;
  createDonation(request: CreateDonationRequest, context?: CreateContext): CreateDonationResponse;
  completePayment(donationId: string, outcome: 'success' | 'failure'): AdminDonation;
  presignUpload(input: { kind: DocumentKind; contentType: string; sizeBytes: number }): UploadTicket;
  submitCase(request: SubmitCaseRequest): SubmitCaseResult;
  simulate: {
    tick(): AdminDonation | null;
    startLive(): void;
    stopLive(): void;
    isLive(): boolean;
  };
  subscribe(listener: (event: BackendEvent) => void): () => void;
  getVersion(): number;
  now(): number;
  staff: typeof STAFF;
  currentDonor: typeof CURRENT_DONOR;
}

interface State {
  cases: Map<string, AdminCase>;
  donations: DonationRecord[];
  ledger: LedgerLine[];
  payouts: Payout[];
  refunds: Refund[];
  audit: AuditEntry[];
  tasks: VerificationTask[];
  team: TeamMember[];
  notifications: DonorNotification[];
  /** The demo outbox («الرسائل المرسلة»): messages the platform would have sent, recipients masked. */
  sent: SentMessage[];
  /** Each gift's chosen channel and contact, kept apart from the records the read API returns. */
  contacts: Map<string, { channel: ContactChannel; to: string; locale: 'ar' | 'en' }>;
  seq: Record<'donation' | 'ledger' | 'txn' | 'payout' | 'refund' | 'audit' | 'task' | 'notification' | 'receipt' | 'case' | 'upload', number>;
}

const iso = (ms: number) => new Date(ms).toISOString();

function staffName(id: string): Localized {
  return STAFF.find((member) => member.id === id)?.name ?? SYSTEM_NAME;
}

function maskContact(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.includes('@')) {
    const [user = '', domain = ''] = value.split('@');
    return `${user.slice(0, 2)}•••@${domain}`;
  }
  return `${value.slice(0, 4)}•••${value.slice(-2)}`;
}

function egp(minor: number, currency: Currency): number {
  return convertMinor(minor, currency, 'EGP', DEMO_FX);
}

function localDayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function toSummary(item: AdminCase): CaseSummary {
  return {
    id: item.id,
    slug: item.slug,
    reference: item.reference,
    category: item.category,
    status: item.status,
    title: item.title,
    summary: item.summary,
    shareText: item.shareText,
    region: item.region,
    currency: item.currency,
    goalMinor: item.goalMinor,
    platformFeeMinor: item.platformFeeMinor,
    raisedMinor: item.raisedMinor,
    donorsCount: item.donorsCount,
    isUrgent: item.isUrgent,
    deadline: item.deadline,
    zakatEligible: item.zakatEligible,
    verifiedAt: item.verifiedAt,
    publishedAt: item.publishedAt,
    fundedAt: item.fundedAt,
    priority: item.priority,
    coverSeed: item.coverSeed,
    createdAt: item.createdAt,
  };
}

export function createMockBackend(options: MockBackendOptions = {}): MockBackend {
  const clock = options.now ?? (() => Date.now());
  const rnd: Random = createRandom(options.seed ?? 20_260_926);
  const live: Random = createRandom((options.seed ?? 7) ^ (clock() & 0xffff));
  const listeners = new Set<(event: BackendEvent) => void>();
  let version = 0;
  const memo = new Map<string, unknown>();

  const state: State = {
    cases: new Map(),
    donations: [],
    ledger: [],
    payouts: [],
    refunds: [],
    audit: [],
    tasks: [],
    team: [],
    notifications: [],
    sent: [],
    contacts: new Map(),
    seq: { donation: 0, ledger: 0, txn: 0, payout: 0, refund: 0, audit: 0, task: 0, notification: 0, receipt: 4_180, case: 10_500, upload: 0 },
  };

  const nextId = (kind: keyof State['seq'], prefix: string) => {
    state.seq[kind] += 1;
    return `${prefix}_${String(state.seq[kind]).padStart(5, '0')}`;
  };

  let seeding = true;
  const emit = (event: BackendEvent) => {
    if (seeding) return;
    version += 1;
    memo.clear();
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A faulty subscriber must never break the backend.
      }
    }
  };

  const cached = <T>(key: string, compute: () => T): T => {
    if (!memo.has(key)) memo.set(key, compute());
    return memo.get(key) as T;
  };

  const mustCase = (id: string): AdminCase => {
    const item = state.cases.get(id);
    if (!item) throw new DomainError('NOT_FOUND', `Case ${id} not found`);
    return item;
  };

  const mustDonation = (id: string): DonationRecord => {
    const item = state.donations.find((donation) => donation.id === id);
    if (!item) throw new DomainError('NOT_FOUND', `Donation ${id} not found`);
    return item;
  };

  const putCase = (item: AdminCase) => {
    state.cases.set(item.id, item);
  };

  // ---------------------------------------------------------------- audit & notifications

  const logAudit = (
    actor: { id: string; name: string; role: Role | 'system' },
    action: string,
    entityType: AuditEntry['entityType'],
    entityId: string,
    entityLabel: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    at = clock(),
  ) => {
    const entry: AuditEntry = { id: nextId('audit', 'aud'), at: iso(at), actor, action, entityType, entityId, entityLabel, before, after };
    state.audit.push(entry);
    emit({ type: 'audit.logged', entry });
    return entry;
  };

  const notifyMe = (notification: Omit<DonorNotification, 'id' | 'read'>) => {
    state.notifications.push({ ...notification, id: nextId('notification', 'ntf'), read: false });
  };

  /** What the API's dispatcher would send to the donor's chosen channel (receipt, case closed). */
  const sendToDonor = (record: DonationRecord, template: 'receipt' | 'case_closed', at: number) => {
    const contact = state.contacts.get(record.id);
    if (!contact) return;
    const ar = contact.locale === 'ar';
    const title = record.caseTitle[contact.locale] || record.caseTitle.ar;
    const receipt = `/${contact.locale}/receipt?donation=${record.id}&token=•••`;
    const transparency = `/${contact.locale}/cases/${record.caseSlug}?tab=transparency`;
    const message =
      template === 'receipt'
        ? ar
          ? {
              subject: `إيصال تبرعك ${record.receiptNumber}`,
              text: `شكرًا لك. وصل تبرعك إلى حالة «${title}».\nرقم الإيصال: ${record.receiptNumber}\n${transparency}`,
            }
          : {
              subject: `Your donation receipt ${record.receiptNumber}`,
              text: `Thank you. Your gift reached “${title}”.\nReceipt no. ${record.receiptNumber}\n${transparency}`,
            }
        : ar
          ? {
              subject: 'اكتملت الحالة التي ساهمت فيها',
              text: `الحالة التي ساهمت فيها «${title}» اكتملت وتم الصرف للجهات، والأمر قُضي بفضل الله. جزاك الله خيرًا.\nهذا إيصالك:\n${receipt}\n${transparency}`,
            }
          : {
              subject: 'A case you supported is complete',
              text: `The case you supported, “${title}”, is complete: everything has been paid out, by the grace of God. Thank you.\nHere is your receipt:\n${receipt}\n${transparency}`,
            };
    state.sent.push({
      id: `msg_${state.sent.length + 1}`,
      at: iso(at),
      channel: contact.channel,
      to: maskRecipient(contact.to),
      subject: contact.channel === 'email' ? message.subject : null,
      text: message.text,
      template,
      donationId: record.id,
      caseId: record.caseId,
      delivery: 'logged',
      error: null,
    });
  };

  const donatedByMe = (caseId: string) =>
    state.donations.some((donation) => donation.caseId === caseId && donation.userId === ME && donation.status === 'succeeded');

  // ---------------------------------------------------------------- ledger

  const postLedger = (kind: LedgerKind, postings: Posting[], at: number, reference: string) => {
    const transactionId = nextId('txn', 'txn');
    const lines = postings.map<LedgerLine>((posting) => ({
      id: nextId('ledger', 'led'),
      transactionId,
      kind,
      at: iso(at),
      account: posting.account,
      direction: posting.direction,
      amountMinor: posting.amountMinor,
      currency: posting.currency,
      memo: posting.memo ?? '',
      reference,
    }));
    state.ledger.push(...lines);
    emit({ type: 'ledger.posted', lines });
    return lines;
  };

  const caseFundBalance = (caseId: string, currency: Currency) =>
    balanceOf(
      ACCOUNTS.caseFund(caseId),
      state.ledger.filter((line) => line.account === ACCOUNTS.caseFund(caseId)),
      currency,
    );

  // ---------------------------------------------------------------- donations

  const actionFor = (
    record: { id: string; method: PaymentMethod; provider: DonationBreakdown['provider']; receiptNumber: string },
    at: number,
  ): { action: CheckoutAction; status: DonationRecord['status'] } => {
    switch (record.provider) {
      case 'fawry':
        return {
          status: 'requires_action',
          action: { type: 'fawry_reference', referenceNumber: live.digits(9), expiresAt: iso(at + 48 * HOUR) },
        };
      case 'instapay':
        return {
          status: 'awaiting_transfer',
          action: {
            type: 'bank_transfer',
            ipa: 'yusr.donations@instapay',
            accountName: 'Yusr Community Development Foundation',
            reference: record.receiptNumber,
            expiresAt: iso(at + 72 * HOUR),
          },
        };
      case 'stripe':
        return {
          status: 'requires_action',
          action: { type: 'stripe_client_secret', clientSecret: `pi_${record.id}_secret_demo`, publishableKey: 'pk_test_demo' },
        };
      default:
        return {
          status: 'requires_action',
          action: { type: 'redirect', provider: record.provider, url: `https://checkout.demo.yusr.example/${record.provider}/${record.id}` },
        };
    }
  };

  const createDonation = (request: CreateDonationRequest, context: CreateContext = {}): CreateDonationResponse => {
    const target = mustCase(request.caseId);
    const userId = context.userId ?? null;
    if (!seeding) {
      assertDonationAllowed(request, {
        caseStatus: target.status,
        caseZakatEligible: target.zakatEligible,
        isGuest: userId === null,
        remainingMinor: remainingInCurrency(target, request.currency, DEMO_FX),
      });
    }
    const breakdown = computeDonationBreakdown({
      amountMinor: request.amountMinor,
      currency: request.currency,
      method: request.method,
      coverFees: request.coverFees,
      caseCurrency: target.currency,
      fx: DEMO_FX,
    });
    const at = context.at ?? clock();
    const id = nextId('donation', 'don');
    state.seq.receipt += 1;
    const receiptNumber = formatReceiptNumber(new Date(at).getFullYear(), state.seq.receipt);
    const { action, status } = actionFor({ id, method: request.method, provider: breakdown.provider, receiptNumber }, at);

    const donorName = request.donor?.name?.trim() || null;
    // «طريقة التواصل المفضلة»: the contact for the chosen channel is required, as on the API.
    const chosenContact =
      request.contactChannel === 'whatsapp'
        ? request.donor?.phone?.trim() || null
        : request.contactChannel === 'email'
          ? request.donor?.email?.trim() || null
          : null;
    if (request.contactChannel && !chosenContact) {
      throw new DomainError('VALIDATION_FAILED', 'Add the contact for the chosen channel', {
        field: request.contactChannel === 'whatsapp' ? 'donor.phone' : 'donor.email',
      });
    }
    const publicName: Localized | null = request.anonymous ? null : (context.displayName ?? (donorName ? { ar: donorName, en: donorName } : null));

    const record: DonationRecord = {
      id,
      receiptNumber,
      status,
      caseId: target.id,
      caseSlug: target.slug,
      caseTitle: target.title,
      caseReference: target.reference,
      type: request.type,
      anonymous: request.anonymous || publicName === null,
      dedication: request.dedication?.trim() || null,
      method: request.method,
      provider: breakdown.provider,
      currency: request.currency,
      amountMinor: request.amountMinor,
      chargedMinor: breakdown.chargedMinor,
      feeMinor: breakdown.estimatedFeeMinor,
      caseCurrency: target.currency,
      netToCaseMinor: breakdown.netToCaseMinor,
      createdAt: iso(at),
      succeededAt: null,
      donorName: donorName ?? (context.displayName ? context.displayName.ar : null),
      donorContact: maskContact(chosenContact ?? request.donor?.email ?? request.donor?.phone ?? null),
      contactChannel: chosenContact ? (request.contactChannel ?? null) : null,
      channel: context.channel ?? 'web',
      userId,
      donorId: context.donorId ?? userId,
      displayName: publicName,
      breakdown,
      region: context.region ?? 'EG-C',
      action,
    };
    state.donations.push(record);
    if (chosenContact && request.contactChannel) state.contacts.set(id, { channel: request.contactChannel, to: chosenContact, locale: request.locale });
    emit({ type: 'donation.created', donation: record });
    return {
      donationId: id,
      status,
      receiptNumber,
      receiptToken: `rt_${id}`,
      breakdown,
      action,
    };
  };

  const settle = (record: DonationRecord, at: number, feeMinor?: number, isLive = false) => {
    if (record.status === 'succeeded') return record;
    const target = mustCase(record.caseId);
    const fee = feeMinor ?? record.breakdown.estimatedFeeMinor;
    postLedger(
      'donation',
      buildDonationPostings({
        caseId: target.id,
        provider: record.provider,
        currency: record.currency,
        chargedMinor: record.chargedMinor,
        feeMinor: fee,
        caseCurrency: target.currency,
        netToCaseMinor: record.netToCaseMinor,
        fxRate: record.breakdown.fxRate,
      }),
      at,
      record.receiptNumber,
    );
    record.status = 'succeeded';
    record.succeededAt = iso(at);
    record.feeMinor = fee;

    const raised = target.raisedMinor + record.netToCaseMinor;
    let next: AdminCase = { ...target, raisedMinor: raised, donorsCount: target.donorsCount + 1, updatedAt: iso(at) };
    const reachedGoal = !seeding && target.status === 'published' && raised >= target.goalMinor;
    if (reachedGoal) {
      assertTransition('published', 'funded', 'system');
      next = {
        ...next,
        status: 'funded',
        fundedAt: iso(at),
        history: [...next.history, { from: 'published', to: 'funded', at: iso(at), actorName: 'system', reason: null }],
        timeline: [...next.timeline, { kind: 'funded', at: iso(at), actor: SYSTEM_NAME }],
      };
      if (next.platformFeeMinor > 0) postLedger('platform_fee', buildPlatformFeePostings(next.id, next.platformFeeMinor, next.currency), at, next.reference);
    }
    putCase(next);

    if (!seeding) {
      sendToDonor(record, 'receipt', at);
      if (record.userId === ME) {
        notifyMe({
          at: iso(at),
          kind: 'receipt',
          caseTitle: target.title,
          caseSlug: target.slug,
          amountMinor: record.chargedMinor,
          currency: record.currency,
          payee: null,
          receiptNumber: record.receiptNumber,
        });
      }
      emit({ type: 'donation.succeeded', donation: record, live: isLive });
      emit({ type: 'case.updated', caseId: target.id });
      if (reachedGoal) {
        logAudit(
          { id: 'system', name: 'system', role: 'system' },
          'case.funded',
          'case',
          target.id,
          target.reference,
          { status: 'published' },
          { status: 'funded' },
          at,
        );
        if (donatedByMe(target.id)) {
          notifyMe({
            at: iso(at),
            kind: 'funded',
            caseTitle: target.title,
            caseSlug: target.slug,
            amountMinor: null,
            currency: null,
            payee: null,
            receiptNumber: null,
          });
        }
        emit({ type: 'case.funded', caseId: target.id });
      }
    }
    return record;
  };

  const completePayment = (donationId: string, outcome: 'success' | 'failure') => {
    const record = mustDonation(donationId);
    if (record.status === 'succeeded' || record.status === 'failed') return record;
    if (outcome === 'failure') {
      record.status = 'failed';
      emit({ type: 'donation.failed', donation: record });
      return record;
    }
    return settle(record, clock());
  };

  // ---------------------------------------------------------------- seeding

  const buildTimeline = (seed: SeedCase, created: number, published: number | null): TimelineEvent[] => {
    // The partner association submits the case and visits the family; Yusr's team reviews it.
    const partner = demoPartnerFor(seed.slug).name;
    const auditorActor: Localized = { ar: partner, en: partner };
    const events: TimelineEvent[] = [{ kind: 'submitted', at: iso(created), actor: { ar: partner, en: partner } }];
    if (seed.status === 'draft') return events;
    events.push({ kind: 'review_started', at: iso(created + 10 * HOUR), actor: CONTENT_TEAM });
    if (seed.status === 'under_review' || seed.status === 'rejected') {
      events.push({ kind: 'visit_scheduled', at: iso(created + 20 * HOUR), actor: auditorActor });
      return events;
    }
    const verifiedAt = published ? published - 20 * HOUR : created + 2 * DAY;
    events.push(
      { kind: 'visit_scheduled', at: iso(created + 20 * HOUR), actor: auditorActor },
      {
        kind: 'visit_completed',
        at: iso(verifiedAt - 6 * HOUR),
        actor: auditorActor,
        note: { ar: 'زيارة منزلية ومطابقة المستندات الأصلية', en: 'Home visit and original documents matched' },
      },
      { kind: 'documents_verified', at: iso(verifiedAt), actor: auditorActor },
    );
    if (published) events.push({ kind: 'published', at: iso(published), actor: CONTENT_TEAM });
    return events;
  };

  const seedCase = (seed: SeedCase): AdminCase => {
    const now = clock();
    const created = now - seed.createdDaysAgo * DAY - 5 * HOUR;
    const published = seed.publishedDaysAgo !== undefined ? now - seed.publishedDaysAgo * DAY - 3 * HOUR : null;
    const funded = seed.fundedDaysAgo !== undefined ? now - seed.fundedDaysAgo * DAY : null;
    const closed = seed.closedDaysAgo !== undefined ? now - seed.closedDaysAgo * DAY : null;
    const verified =
      seed.status === 'draft' || seed.status === 'under_review' || seed.status === 'rejected' ? null : published ? published - 20 * HOUR : created + 2 * DAY;
    const id = `case_${seed.ref}`;
    const auditor = seed.auditorId ? { id: seed.auditorId, name: staffName(seed.auditorId).ar } : null;

    const history: AdminCase['history'] = [{ from: null, to: 'draft', at: iso(created), actorName: seed.submittedBy.name, reason: null }];
    const push = (from: CaseStatus, to: CaseStatus, at: number, actorName: string, reason: string | null = null) =>
      history.push({ from, to, at: iso(at), actorName, reason });
    if (seed.status !== 'draft') push('draft', 'under_review', created + 2 * HOUR, seed.submittedBy.name);
    if (seed.status === 'rejected') push('under_review', 'rejected', created + 2 * DAY, staffName('u_youssef').ar, seed.reason ?? null);
    if (verified) push('under_review', 'field_verified', verified, auditor?.name ?? staffName('u_mahmoud').ar);
    if (published) push('field_verified', 'published', published, staffName('u_youssef').ar);
    if (funded) push('published', 'funded', funded, 'system');
    if (closed) push('funded', 'closed', closed, staffName('u_heba').ar);
    if (seed.status === 'paused') push('published', 'paused', now - 2 * DAY, staffName('u_youssef').ar, seed.reason ?? null);

    const timeline = buildTimeline(seed, created, published);
    if (funded) timeline.push({ kind: 'funded', at: iso(funded), actor: SYSTEM_NAME });

    const disbursements: DisbursementLine[] = seed.plan.map((line, index) => ({
      id: `${id}_l${index + 1}`,
      payeeType: line.payeeType,
      payee: line.payee,
      purpose: line.purpose,
      amountMinor: toMinor(line.amount, seed.currency),
      status: 'planned',
      paidAt: null,
    }));

    return {
      id,
      slug: seed.slug,
      reference: `YSR-${seed.ref}`,
      category: seed.category,
      status: seed.status,
      title: seed.title,
      summary: seed.summary,
      shareText: seed.shareText ?? null,
      partner: { name: demoPartnerFor(seed.slug).name, registrationNumber: demoPartnerFor(seed.slug).registrationNumber },
      region: seed.region,
      currency: seed.currency,
      goalMinor: seedAmounts(seed).goalMinor,
      platformFeeMinor: seedAmounts(seed).platformFeeMinor,
      raisedMinor: 0,
      donorsCount: 0,
      isUrgent: seed.urgentInHours !== undefined,
      deadline: seed.urgentInHours !== undefined ? iso(now + seed.urgentInHours * HOUR) : null,
      zakatEligible: seed.zakat,
      verifiedAt: verified ? iso(verified) : null,
      publishedAt: published ? iso(published) : null,
      fundedAt: funded ? iso(funded) : null,
      priority: seed.priority ?? 0,
      coverSeed: (seed.ref * 7919) % 997,
      createdAt: iso(created),
      story: seed.story,
      beneficiary: seed.beneficiary,
      documents: seed.documents.map((document, index) => ({
        id: `${id}_d${index + 1}`,
        kind: document.kind,
        title: DOCUMENT_TITLES[document.kind],
        pages: document.pages,
        redacted: true,
        verifiedBy: document.kind === 'medical_report' ? { ar: 'المراجع الطبي', en: 'Medical reviewer' } : PARTNER_LABEL,
        issuedAt: iso(created - (index + 2) * DAY),
      })),
      timeline,
      disbursements,
      updates: (seed.updates ?? []).map((update, index) => ({ id: `${id}_u${index + 1}`, at: iso(now - update.daysAgo * DAY), body: update.body })),
      recentDonations: [],
      submittedBy: { name: demoPartnerFor(seed.slug).name, relation: 'association', association: demoPartnerFor(seed.slug) },
      auditor,
      history,
      updatedAt: iso(Math.max(...history.map((entry) => Date.parse(entry.at)))),
    };
  };

  const quickAmount = (currency: Currency, random: Random): number => {
    if (currency === 'SAR')
      return random.weighted([
        [10, 2],
        [50, 4],
        [100, 4],
        [250, 2],
        [500, 1],
        [1_000, 0.5],
      ] as const);
    if (currency === 'USD')
      return random.weighted([
        [10, 3],
        [25, 4],
        [50, 3],
        [100, 2],
        [250, 0.6],
      ] as const);
    return random.weighted([
      [50, 3],
      [100, 6],
      [200, 3],
      [250, 5],
      [500, 5],
      [1_000, 3],
      [1_500, 1],
      [2_000, 1.2],
      [5_000, 0.7],
      [10_000, 0.2],
    ] as const);
  };

  const pickMethod = (currency: Currency, random: Random): PaymentMethod => {
    if (currency === 'SAR')
      return random.weighted([
        ['mada', 6],
        ['apple_pay', 3],
        ['card', 1],
      ] as const);
    if (currency === 'USD')
      return random.weighted([
        ['card', 7],
        ['apple_pay', 3],
      ] as const);
    return random.weighted([
      ['card', 45],
      ['vodafone_cash', 20],
      ['instapay', 15],
      ['fawry', 12],
      ['apple_pay', 8],
    ] as const);
  };

  const pickDonor = (random: Random): SeedDonor => random.weighted(DONORS.map((donor) => [donor, donor.weight] as const));

  const donorCurrency = (donor: SeedDonor, caseCurrency: Currency): Currency => {
    if (donor.region === 'INT') return 'USD';
    if (donor.region.startsWith('SA')) return 'SAR';
    return caseCurrency === 'SAR' ? 'SAR' : 'EGP';
  };

  /** Personal donation history for the signed-in persona (case slug → [amount, days ago]). */
  const MY_HISTORY: ReadonlyArray<readonly [string, number, number]> = [
    ['open-heart-surgery-cairo', 500, 3],
    ['gharima-promissory-notes-beni-suef', 1_000, 8],
    ['winter-blankets-qena', 250, 10],
    ['school-bags-aswan', 300, 12],
    ['insulin-pump-ismailia', 1_500, 28],
  ];

  const seedDonations = () => {
    type Draft = { caseId: string; request: CreateDonationRequest; context: CreateContext; at: number };
    const drafts: Draft[] = [];
    const now = clock();

    for (const item of state.cases.values()) {
      if (!item.publishedAt) continue;
      const start = Date.parse(item.publishedAt);
      const end = item.fundedAt ? Date.parse(item.fundedAt) - HOUR : item.status === 'paused' ? now - 2 * DAY : now - 10 * 60_000;
      const target = SEED_CASES.find((seed) => seed.slug === item.slug)!;
      let remaining = seedAmounts(target).raisedMinor;

      const mine = MY_HISTORY.filter(([slug]) => slug === item.slug);
      for (const [, amount, daysAgo] of mine) {
        const amountMinor = toMinor(amount, item.currency);
        remaining -= amountMinor;
        drafts.push({
          caseId: item.id,
          at: Math.min(end, now - daysAgo * DAY),
          request: {
            caseId: item.id,
            amountMinor,
            currency: item.currency,
            method: 'card',
            coverFees: true,
            anonymous: false,
            type: item.zakatEligible ? 'zakat' : 'sadaqah',
            locale: 'ar',
          },
          context: { userId: ME, donorId: ME, displayName: CURRENT_DONOR.name, region: CURRENT_DONOR.region, channel: 'web' },
        });
      }

      let guard = 0;
      while (remaining > 0) {
        const donor = pickDonor(rnd);
        const currency = donorCurrency(donor, item.currency);
        const method = pickMethod(currency, rnd);
        let amountMinor = toMinor(quickAmount(currency, rnd) * (donor.major ? 10 : 1), currency);
        let coverFees = rnd.chance(0.45);
        const provisional = computeDonationBreakdown({ amountMinor, currency, method, coverFees, caseCurrency: item.currency, fx: DEMO_FX });
        let finalMethod = method;
        let finalCurrency = currency;
        const mustBeExact = item.status === 'funded' || item.status === 'closed';
        // Open cases keep natural gift amounts: draw smaller gifts until we are just below the target.
        if (!mustBeExact && provisional.netToCaseMinor >= remaining) {
          if (remaining < toMinor(60, item.currency) || ++guard > 4_000) break;
          continue;
        }
        if (provisional.netToCaseMinor >= remaining) {
          // Final gift: exact amount in the case currency so the seeded total matches.
          finalCurrency = item.currency;
          finalMethod = item.currency === 'SAR' ? 'mada' : 'card';
          amountMinor = remaining;
          coverFees = true;
        }
        const anonymous = rnd.chance(0.28);
        const at = start + Math.pow(rnd.next(), 0.85) * Math.max(HOUR, end - start);
        const net =
          finalCurrency === currency && finalMethod === method && amountMinor !== remaining
            ? provisional.netToCaseMinor
            : computeDonationBreakdown({ amountMinor, currency: finalCurrency, method: finalMethod, coverFees, caseCurrency: item.currency, fx: DEMO_FX })
                .netToCaseMinor;
        remaining -= net;
        drafts.push({
          caseId: item.id,
          at,
          request: {
            caseId: item.id,
            amountMinor,
            currency: finalCurrency,
            method: finalMethod,
            coverFees,
            anonymous,
            type: item.zakatEligible && rnd.chance(0.4) ? 'zakat' : 'sadaqah',
            locale: 'ar',
            dedication: rnd.chance(0.08) ? 'صدقة جارية عن روح الوالدين' : null,
          },
          context: { donorId: donor.id, displayName: anonymous ? null : donor.name, region: donor.region, channel: rnd.chance(0.55) ? 'mobile' : 'web' },
        });
      }
    }

    drafts.sort((a, b) => a.at - b.at);
    for (const draft of drafts) {
      const response = createDonation(draft.request, { ...draft.context, at: draft.at });
      const record = mustDonation(response.donationId);
      if (record.userId !== ME) record.donorName = draft.context.displayName?.ar ?? DONORS.find((d) => d.id === draft.context.donorId)?.name.ar ?? null;
      settle(record, draft.at + 90_000);
      if (record.userId === ME) {
        const target = mustCase(record.caseId);
        notifyMe({
          at: record.succeededAt!,
          kind: 'receipt',
          caseTitle: target.title,
          caseSlug: target.slug,
          amountMinor: record.chargedMinor,
          currency: record.currency,
          payee: null,
          receiptNumber: record.receiptNumber,
        });
      }
    }
  };

  /** Gateways settle to the bank two days after capture. */
  const seedSettlements = () => {
    const now = clock();
    const groups = new Map<string, { provider: DonationRecord['provider']; currency: Currency; amount: number; at: number }>();
    for (const record of state.donations) {
      if (record.status !== 'succeeded' || !record.succeededAt) continue;
      const captured = Date.parse(record.succeededAt);
      if (now - captured < 2 * DAY) continue;
      const settleAt = captured + 2 * DAY;
      const key = `${record.provider}:${record.currency}:${localDayKey(settleAt)}`;
      const group = groups.get(key) ?? {
        provider: record.provider,
        currency: record.currency,
        amount: 0,
        at: new Date(localDayKey(settleAt)).getTime() + 9 * HOUR,
      };
      group.amount += record.chargedMinor - record.feeMinor;
      groups.set(key, group);
    }
    for (const group of [...groups.values()].sort((a, b) => a.at - b.at)) {
      postLedger(
        'settlement',
        buildSettlementPostings(group.provider, group.amount, group.currency),
        group.at,
        `STL-${group.provider.toUpperCase()}-${localDayKey(group.at)}`,
      );
    }
  };

  const seedOperations = () => {
    const now = clock();
    const heba = { id: 'u_heba', name: staffName('u_heba').ar };
    const karim = { id: 'u_karim', name: staffName('u_karim').ar };

    for (const seed of SEED_CASES) {
      const item = state.cases.get(`case_${seed.ref}`)!;
      const fundedAt = item.fundedAt ? Date.parse(item.fundedAt) : now;
      if (item.fundedAt && item.platformFeeMinor > 0) {
        postLedger('platform_fee', buildPlatformFeePostings(item.id, item.platformFeeMinor, item.currency), fundedAt, item.reference);
      }
      if (!seed.payout) continue;
      const lines = item.disbursements.map((line) => ({ ...line }));
      for (const line of lines) {
        state.seq.payout += 1;
        const payout: Payout = {
          id: `pay_${String(state.seq.payout).padStart(5, '0')}`,
          reference: `PAY-${item.reference.slice(4)}-${line.id.slice(-2).toUpperCase()}`,
          lineId: line.id,
          caseId: item.id,
          caseReference: item.reference,
          caseTitle: item.title,
          payeeType: line.payeeType,
          payee: line.payee,
          purpose: line.purpose,
          amountMinor: line.amountMinor,
          currency: item.currency,
          status: seed.payout,
          requestedBy: heba,
          approvedBy: karim,
          createdAt: iso(fundedAt + 6 * HOUR),
          paidAt: seed.payout === 'paid' ? iso(fundedAt + 2 * DAY) : null,
        };
        state.payouts.push(payout);
        line.status = seed.payout;
        line.paidAt = payout.paidAt;
        if (seed.payout === 'paid') {
          postLedger('payout', buildPayoutPostings(item.id, line.amountMinor, item.currency), fundedAt + 2 * DAY, payout.reference);
        }
      }
      const timeline = [...item.timeline];
      if (seed.payout === 'paid') timeline.push({ kind: 'disbursed', at: iso(fundedAt + 2 * DAY), actor: PARTNER_LABEL });
      if (item.status === 'closed' && item.history.some((entry) => entry.to === 'closed')) {
        timeline.push({ kind: 'closed', at: item.history.find((entry) => entry.to === 'closed')!.at, actor: PARTNER_LABEL });
      }
      putCase({ ...item, disbursements: lines, timeline });
      if (seed.payout === 'paid' && donatedByMe(item.id)) {
        notifyMe({
          at: iso(fundedAt + 2 * DAY),
          kind: 'disbursed',
          caseTitle: item.title,
          caseSlug: item.slug,
          amountMinor: lines[0]!.amountMinor,
          currency: item.currency,
          payee: lines[0]!.payee,
          receiptNumber: null,
        });
      }
      if (seed.status === 'funded' && donatedByMe(item.id)) {
        notifyMe({
          at: item.fundedAt!,
          kind: 'funded',
          caseTitle: item.title,
          caseSlug: item.slug,
          amountMinor: null,
          currency: null,
          payee: null,
          receiptNumber: null,
        });
      }
    }

    // Transfers and outlet payments still waiting for money (finance reconciliation queue).
    const pending: Array<[string, PaymentMethod, number, string]> = [
      ['open-heart-surgery-cairo', 'instapay', 2_000, 'd04'],
      ['village-fire-relief-sohag', 'instapay', 5_000, 'd11'],
      ['dialysis-sessions-dakahlia', 'fawry', 300, 'd16'],
    ];
    for (const [slug, method, amount, donorId] of pending) {
      const item = [...state.cases.values()].find((entry) => entry.slug === slug)!;
      const donor = DONORS.find((entry) => entry.id === donorId)!;
      createDonation(
        { caseId: item.id, amountMinor: toMinor(amount, 'EGP'), currency: 'EGP', method, coverFees: false, anonymous: false, type: 'sadaqah', locale: 'ar' },
        { donorId, displayName: donor.name, region: donor.region, at: now - rnd.int(2, 20) * HOUR, channel: 'web' },
      );
      state.donations[state.donations.length - 1]!.donorName = donor.name.ar;
    }

    // A refund awaiting a second financial officer (maker-checker).
    const duplicate = [...state.donations].reverse().find((record) => record.status === 'succeeded' && record.userId !== ME && record.method === 'card');
    if (duplicate) {
      state.seq.refund += 1;
      state.refunds.push({
        id: `ref_${String(state.seq.refund).padStart(5, '0')}`,
        donationId: duplicate.id,
        receiptNumber: duplicate.receiptNumber,
        amountMinor: duplicate.chargedMinor,
        currency: duplicate.currency,
        reason: 'خصم مكرر من نفس البطاقة — طلب المتبرع عبر خدمة العملاء',
        status: 'requested',
        requestedBy: heba,
        approvedBy: null,
        createdAt: iso(now - 5 * HOUR),
      });
    }

    // Verification tasks.
    for (const item of state.cases.values()) {
      if (!item.auditor) continue;
      const seed = SEED_CASES.find((entry) => entry.slug === item.slug)!;
      const done = !['under_review', 'draft', 'rejected'].includes(item.status);
      const scheduled = item.status === 'under_review' && seed.ref % 2 === 1;
      state.seq.task += 1;
      state.tasks.push({
        id: `tsk_${String(state.seq.task).padStart(5, '0')}`,
        caseId: item.id,
        auditorId: item.auditor.id,
        auditorName: item.auditor.name,
        status: done ? 'completed' : scheduled ? 'scheduled' : 'assigned',
        visitAt: done ? item.verifiedAt : scheduled ? iso(now + 26 * HOUR) : null,
        checklist: {
          identity: done || scheduled,
          residence: done,
          documents: done || scheduled,
          cost: done,
          alternatives: done,
        },
        recommendedMinor: done ? caseNeedMinor(item) : null,
        notes: done ? 'تمت الزيارة ومطابقة المستندات، والاحتياج مطابق للمبلغ المطلوب.' : null,
      });
    }

    // Audit trail from the status histories.
    const roleOf = (name: string): Role | 'system' =>
      name === 'system' ? 'system' : (STAFF.find((member) => member.name.ar === name)?.roles[0] ?? 'volunteer');
    const entries: AuditEntry[] = [];
    for (const item of state.cases.values()) {
      for (const change of item.history) {
        if (!change.from) continue;
        entries.push({
          id: '',
          at: change.at,
          actor: { id: STAFF.find((member) => member.name.ar === change.actorName)?.id ?? 'system', name: change.actorName, role: roleOf(change.actorName) },
          action: `case.${change.to}`,
          entityType: 'case',
          entityId: item.id,
          entityLabel: item.reference,
          before: { status: change.from },
          after: { status: change.to, ...(change.reason ? { reason: change.reason } : {}) },
        });
      }
    }
    for (const payout of state.payouts) {
      entries.push({
        id: '',
        at: payout.createdAt,
        actor: { id: payout.requestedBy.id, name: payout.requestedBy.name, role: 'financial_officer' },
        action: 'payout.requested',
        entityType: 'payout',
        entityId: payout.id,
        entityLabel: payout.reference,
        before: null,
        after: { amountMinor: payout.amountMinor, payee: payout.payee.ar },
      });
    }
    entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (const entry of entries) {
      state.seq.audit += 1;
      state.audit.push({ ...entry, id: `aud_${String(state.seq.audit).padStart(5, '0')}` });
    }

    state.team = STAFF.map((member, index) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      roles: [...member.roles],
      mfa: member.mfa,
      lastActiveAt: iso(now - (index * 37 + 4) * 60_000),
    }));
  };

  // ---------------------------------------------------------------- seed everything

  for (const seed of SEED_CASES) {
    const item = seedCase(seed);
    state.cases.set(item.id, item);
  }
  seedDonations();
  seedSettlements();
  seedOperations();
  state.ledger.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  seeding = false;

  // ---------------------------------------------------------------- reads

  const read = createReadApi(state, clock, cached);

  // ---------------------------------------------------------------- admin (RBAC-enforced)

  const adminFor = (actor: Actor) => {
    const grants = permissionsFor(actor.roles);
    const actorRef = { id: actor.id, name: actor.name, role: actor.roles[0] ?? 'donor' } as const;
    const ensure = (permission: Permission) => {
      if (!grants.has(permission)) throw new DomainError('FORBIDDEN', `Missing permission ${permission}`, { permission });
    };

    const transition = (caseId: string, to: CaseStatus, reason?: string) => {
      const item = mustCase(caseId);
      assertTransition(item.status, to, grants, reason);
      const at = clock();
      const timeline = [...item.timeline];
      if (to === 'published') timeline.push({ kind: 'published', at: iso(at), actor: CONTENT_TEAM });
      if (to === 'field_verified') timeline.push({ kind: 'documents_verified', at: iso(at), actor: { ar: actor.name, en: actor.name } });
      if (to === 'closed') timeline.push({ kind: 'closed', at: iso(at), actor: { ar: actor.name, en: actor.name } });
      const next: AdminCase = {
        ...item,
        status: to,
        publishedAt: to === 'published' && !item.publishedAt ? iso(at) : item.publishedAt,
        verifiedAt: to === 'field_verified' ? iso(at) : item.verifiedAt,
        timeline,
        history: [...item.history, { from: item.status, to, at: iso(at), actorName: actor.name, reason: reason?.trim() || null }],
        updatedAt: iso(at),
      };
      putCase(next);
      logAudit(actorRef, `case.${to}`, 'case', item.id, item.reference, { status: item.status }, { status: to, ...(reason ? { reason } : {}) }, at);
      // «اكتملت الحالة»: every donor of a funded case that closes hears it once, on their chosen channel.
      if (to === 'closed' && item.status === 'funded') {
        const told = new Set<string>();
        const gifts = state.donations.filter((donation) => donation.caseId === item.id && donation.status === 'succeeded' && state.contacts.has(donation.id));
        for (const donation of gifts.reverse()) {
          const who = state.contacts.get(donation.id)!.to;
          if (told.has(who)) continue;
          told.add(who);
          sendToDonor(donation, 'case_closed', at);
        }
      }
      emit({ type: 'case.updated', caseId });
      return next;
    };

    const api = {
      overview: () => {
        ensure('cases:read');
        return read.overview();
      },
      cases: (filter?: { status?: CaseStatus; q?: string }) => {
        ensure('cases:read');
        return read
          .adminCases()
          .filter(
            (item) =>
              (!filter?.status || item.status === filter.status) &&
              (!filter?.q || `${item.reference} ${item.title.ar} ${item.title.en}`.toLowerCase().includes(filter.q.toLowerCase())),
          );
      },
      transitionCase: transition,
      setPriority: (caseId: string, priority: number) => {
        ensure('cases:prioritize');
        const item = mustCase(caseId);
        const next = { ...item, priority, updatedAt: iso(clock()) };
        putCase(next);
        logAudit(actorRef, 'case.priority', 'case', caseId, item.reference, { priority: item.priority }, { priority });
        emit({ type: 'case.updated', caseId });
        return next;
      },
      editCase: (caseId: string, input: EditCaseInput) => {
        ensure('cases:edit');
        // The same limits as editCaseSchema, checked by hand so the demo bundle stays free of zod.
        const limits: Partial<Record<keyof EditCaseInput, number>> = { title: 120, summary: 240, shareText: 220, story: 6000 };
        for (const [key, max] of Object.entries(limits) as Array<[keyof EditCaseInput, number]>) {
          const value = input[key] as Localized | null | undefined;
          if (!value) continue;
          if (![value.ar, value.en].every((text) => typeof text === 'string' && text.trim().length > 0 && text.trim().length <= max)) {
            throw new DomainError('VALIDATION_FAILED', `${key}: 1–${max} characters in Arabic and English`);
          }
        }
        if (Object.keys(input).length === 0) throw new DomainError('VALIDATION_FAILED', 'Nothing to change');
        const item = mustCase(caseId);
        const { deadline, ...rest } = input;
        const patch: Partial<AdminCase> = { ...rest, ...(deadline !== undefined ? { deadline: deadline ?? null } : {}) };
        if (patch.isUrgent && !(patch.deadline ?? item.deadline)) throw new DomainError('VALIDATION_FAILED', 'Urgent cases need a deadline');
        const next: AdminCase = { ...item, ...patch, updatedAt: iso(clock()) };
        putCase(next);
        const before = Object.fromEntries(Object.keys(patch).map((key) => [key, item[key as keyof AdminCase]]));
        logAudit(actorRef, 'case.edited', 'case', caseId, item.reference, before, { ...patch });
        emit({ type: 'case.updated', caseId });
        return next;
      },
      assignAuditor: (caseId: string, auditorId: string) => {
        ensure('verifications:assign');
        const item = mustCase(caseId);
        const member = STAFF.find((entry) => entry.id === auditorId && entry.roles.includes('field_auditor'));
        if (!member) throw new DomainError('VALIDATION_FAILED', 'Not a field auditor');
        state.seq.task += 1;
        const task: VerificationTask = {
          id: `tsk_${String(state.seq.task).padStart(5, '0')}`,
          caseId,
          auditorId,
          auditorName: member.name.ar,
          status: 'assigned',
          visitAt: null,
          checklist: { identity: false, residence: false, documents: false, cost: false, alternatives: false },
          recommendedMinor: null,
          notes: null,
        };
        state.tasks = [...state.tasks.filter((entry) => entry.caseId !== caseId || entry.status === 'completed'), task];
        putCase({ ...item, auditor: { id: auditorId, name: member.name.ar } });
        logAudit(actorRef, 'verification.assigned', 'verification', task.id, item.reference, null, { auditor: member.name.ar });
        emit({ type: 'case.updated', caseId });
        return task;
      },
      verificationTasks: () => {
        ensure('cases:read');
        return [...state.tasks];
      },
      updateChecklist: (taskId: string, item: ChecklistItem, checked: boolean) => {
        ensure('verifications:perform');
        const index = state.tasks.findIndex((task) => task.id === taskId);
        if (index < 0) throw new DomainError('NOT_FOUND');
        const task = state.tasks[index]!;
        const next: VerificationTask = {
          ...task,
          status: task.status === 'assigned' ? 'scheduled' : task.status,
          visitAt: task.visitAt ?? iso(clock()),
          checklist: { ...task.checklist, [item]: checked },
        };
        state.tasks = state.tasks.map((entry, i) => (i === index ? next : entry));
        emit({ type: 'case.updated', caseId: task.caseId });
        return next;
      },
      completeVerification: (taskId: string, recommendedMinor: number, notes?: string) => {
        ensure('cases:verify');
        const task = state.tasks.find((entry) => entry.id === taskId);
        if (!task) throw new DomainError('NOT_FOUND');
        if (!Object.values(task.checklist).every(Boolean)) {
          throw new DomainError('VALIDATION_FAILED', 'Complete the checklist first');
        }
        state.tasks = state.tasks.map((entry) =>
          entry.id === taskId ? { ...entry, status: 'completed', recommendedMinor, notes: notes ?? entry.notes } : entry,
        );
        const item = mustCase(task.caseId);
        const withVisit: AdminCase = {
          ...item,
          timeline: [...item.timeline, { kind: 'visit_completed', at: iso(clock()), actor: { ar: actor.name, en: actor.name } }],
        };
        putCase(withVisit);
        return transition(task.caseId, 'field_verified');
      },
      ledger: (query?: LedgerQuery) => {
        ensure('finance:read');
        return read.ledger(query);
      },
      donations: (filter?: { status?: AdminDonation['status'] }) => {
        ensure('finance:read');
        return read.donations(filter);
      },
      confirmTransfer: (donationId: string, bankReference: string, receivedMinor: number) => {
        ensure('finance:reconcile');
        const record = mustDonation(donationId);
        if (record.status !== 'awaiting_transfer') throw new DomainError('VALIDATION_FAILED', 'Donation is not awaiting a transfer');
        if (bankReference.trim().length < 4) throw new DomainError('VALIDATION_FAILED', 'Bank reference required', { field: 'bankReference' });
        if (receivedMinor !== record.chargedMinor) {
          throw new DomainError('AMOUNT_MISMATCH', 'Received amount differs from the donation', { expectedMinor: record.chargedMinor, receivedMinor });
        }
        settle(record, clock(), 0);
        logAudit(
          actorRef,
          'donation.transfer_confirmed',
          'donation',
          record.id,
          record.receiptNumber,
          { status: 'awaiting_transfer' },
          { status: 'succeeded', bankReference },
        );
        return record as AdminDonation;
      },
      refunds: () => {
        ensure('finance:read');
        return [...state.refunds].reverse();
      },
      requestRefund: (donationId: string, reason: string, amountMinor?: number) => {
        ensure('finance:refunds');
        const record = mustDonation(donationId);
        if (record.status !== 'succeeded') throw new DomainError('DONATION_NOT_REFUNDABLE');
        const amount = amountMinor ?? record.chargedMinor;
        if (amount > record.chargedMinor) throw new DomainError('REFUND_EXCEEDS_DONATION');
        if (!reason.trim()) throw new DomainError('REASON_REQUIRED');
        state.seq.refund += 1;
        const refund: Refund = {
          id: `ref_${String(state.seq.refund).padStart(5, '0')}`,
          donationId,
          receiptNumber: record.receiptNumber,
          amountMinor: amount,
          currency: record.currency,
          reason,
          status: 'requested',
          requestedBy: { id: actor.id, name: actor.name },
          approvedBy: null,
          createdAt: iso(clock()),
        };
        state.refunds.push(refund);
        logAudit(actorRef, 'refund.requested', 'refund', refund.id, record.receiptNumber, null, { amountMinor: amount, reason });
        emit({ type: 'refund.updated', refund });
        return refund;
      },
      approveRefund: (refundId: string) => {
        ensure('finance:approve');
        const refund = state.refunds.find((entry) => entry.id === refundId);
        if (!refund) throw new DomainError('NOT_FOUND');
        if (refund.requestedBy.id === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN');
        if (refund.status !== 'requested') throw new DomainError('VALIDATION_FAILED', 'Refund already handled');
        const record = mustDonation(refund.donationId);
        const item = mustCase(record.caseId);
        const postings = buildRefundPostings(
          {
            caseId: item.id,
            provider: record.provider,
            currency: record.currency,
            chargedMinor: record.chargedMinor,
            feeMinor: record.feeMinor,
            caseCurrency: item.currency,
            netToCaseMinor: record.netToCaseMinor,
            fxRate: record.breakdown.fxRate,
          },
          refund.amountMinor,
        );
        postLedger('refund', postings, clock(), record.receiptNumber);
        const caseDebit = postings.find((posting) => posting.account === ACCOUNTS.caseFund(item.id))?.amountMinor ?? 0;
        const full = refund.amountMinor === record.chargedMinor;
        record.status = full ? 'refunded' : 'partially_refunded';
        putCase({
          ...item,
          raisedMinor: Math.max(0, item.raisedMinor - caseDebit),
          donorsCount: Math.max(0, item.donorsCount - (full ? 1 : 0)),
          updatedAt: iso(clock()),
        });
        const next: Refund = { ...refund, status: 'processed', approvedBy: { id: actor.id, name: actor.name } };
        state.refunds = state.refunds.map((entry) => (entry.id === refundId ? next : entry));
        logAudit(actorRef, 'refund.approved', 'refund', refund.id, record.receiptNumber, { status: 'requested' }, { status: 'processed' });
        emit({ type: 'refund.updated', refund: next });
        emit({ type: 'case.updated', caseId: item.id });
        return next;
      },
      payouts: () => {
        ensure('finance:read');
        return [...state.payouts].reverse();
      },
      requestPayout: (caseId: string, lineId: string) => {
        ensure('finance:payouts');
        const item = mustCase(caseId);
        const line = item.disbursements.find((entry) => entry.id === lineId);
        if (!line) throw new DomainError('NOT_FOUND');
        if (line.status !== 'planned') throw new DomainError('VALIDATION_FAILED', 'Line already requested');
        const committed = state.payouts
          .filter((payout) => payout.caseId === caseId && (payout.status === 'requested' || payout.status === 'approved'))
          .reduce((sum, payout) => sum + payout.amountMinor, 0);
        if (caseFundBalance(caseId, item.currency) - committed < line.amountMinor) throw new DomainError('INSUFFICIENT_CASE_FUNDS');
        state.seq.payout += 1;
        const payout: Payout = {
          id: `pay_${String(state.seq.payout).padStart(5, '0')}`,
          reference: `PAY-${item.reference.slice(4)}-${lineId.slice(-2).toUpperCase()}`,
          lineId,
          caseId,
          caseReference: item.reference,
          caseTitle: item.title,
          payeeType: line.payeeType,
          payee: line.payee,
          purpose: line.purpose,
          amountMinor: line.amountMinor,
          currency: item.currency,
          status: 'requested',
          requestedBy: { id: actor.id, name: actor.name },
          approvedBy: null,
          createdAt: iso(clock()),
          paidAt: null,
        };
        state.payouts.push(payout);
        logAudit(actorRef, 'payout.requested', 'payout', payout.id, payout.reference, null, { amountMinor: payout.amountMinor, payee: line.payee.ar });
        emit({ type: 'payout.updated', payout });
        return payout;
      },
      approvePayout: (payoutId: string) => {
        ensure('finance:approve');
        const payout = state.payouts.find((entry) => entry.id === payoutId);
        if (!payout) throw new DomainError('NOT_FOUND');
        if (payout.requestedBy.id === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN');
        if (payout.status !== 'requested') throw new DomainError('VALIDATION_FAILED', 'Payout already handled');
        const next: Payout = { ...payout, status: 'approved', approvedBy: { id: actor.id, name: actor.name } };
        state.payouts = state.payouts.map((entry) => (entry.id === payoutId ? next : entry));
        const item = mustCase(payout.caseId);
        putCase({
          ...item,
          disbursements: item.disbursements.map((line) => (line.id === payout.lineId ? { ...line, status: 'approved' } : line)),
        });
        logAudit(actorRef, 'payout.approved', 'payout', payout.id, payout.reference, { status: 'requested' }, { status: 'approved' });
        emit({ type: 'payout.updated', payout: next });
        return next;
      },
      markPayoutPaid: (payoutId: string, bankReference: string) => {
        ensure('finance:payouts');
        const payout = state.payouts.find((entry) => entry.id === payoutId);
        if (!payout) throw new DomainError('NOT_FOUND');
        if (payout.status !== 'approved') throw new DomainError('VALIDATION_FAILED', 'Payout must be approved first');
        if (bankReference.trim().length < 4) throw new DomainError('VALIDATION_FAILED', 'Bank reference required', { field: 'bankReference' });
        if (payout.requestedBy.id === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN');
        const at = clock();
        postLedger('payout', buildPayoutPostings(payout.caseId, payout.amountMinor, payout.currency), at, payout.reference);
        const next: Payout = { ...payout, status: 'paid', paidAt: iso(at) };
        state.payouts = state.payouts.map((entry) => (entry.id === payoutId ? next : entry));
        const item = mustCase(payout.caseId);
        putCase({
          ...item,
          disbursements: item.disbursements.map((line) => (line.id === payout.lineId ? { ...line, status: 'paid', paidAt: iso(at) } : line)),
          timeline: [...item.timeline, { kind: 'disbursed', at: iso(at), actor: PARTNER_LABEL }],
        });
        if (donatedByMe(item.id)) {
          notifyMe({
            at: iso(at),
            kind: 'disbursed',
            caseTitle: item.title,
            caseSlug: item.slug,
            amountMinor: payout.amountMinor,
            currency: payout.currency,
            payee: payout.payee,
            receiptNumber: null,
          });
        }
        logAudit(
          actorRef,
          'payout.paid',
          'payout',
          payout.id,
          payout.reference,
          { status: 'approved' },
          { status: 'paid', bankReference: bankReference.trim() },
          at,
        );
        emit({ type: 'payout.updated', payout: next });
        emit({ type: 'case.updated', caseId: item.id });
        return next;
      },
      donors: () => {
        ensure('crm:read');
        return read.donors();
      },
      volunteers: () => {
        ensure('crm:read');
        return read.volunteers();
      },
      team: () => [...state.team],
      updateRoles: (userId: string, roles: Role[]) => {
        ensure('team:manage');
        const member = state.team.find((entry) => entry.id === userId);
        if (!member) throw new DomainError('NOT_FOUND');
        const next = { ...member, roles };
        state.team = state.team.map((entry) => (entry.id === userId ? next : entry));
        logAudit(actorRef, 'user.roles_updated', 'user', userId, member.email, { roles: member.roles }, { roles });
        return next;
      },
      audit: (limit = 100) => {
        ensure('audit:read');
        return read.audit(limit);
      },
      sentMessages: (limit = 100): SentMessage[] => {
        if (!canSeeSentMessages(actor.roles)) throw new DomainError('FORBIDDEN', 'The demo outbox is for super admins and content moderators');
        return [...state.sent].reverse().slice(0, limit);
      },
    };
    return api;
  };

  const toAsyncAdmin = (actor: Actor): AdminClient => {
    const sync = adminFor(actor);
    const wrap =
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): Promise<R> =>
        new Promise<R>((resolve, reject) => {
          try {
            resolve(fn(...args));
          } catch (error) {
            reject(error);
          }
        });
    return {
      overview: wrap(sync.overview),
      cases: wrap(sync.cases),
      transitionCase: wrap(sync.transitionCase),
      setPriority: wrap(sync.setPriority),
      editCase: wrap(sync.editCase),
      assignAuditor: wrap(sync.assignAuditor),
      verificationTasks: wrap(sync.verificationTasks),
      updateChecklist: wrap(sync.updateChecklist),
      completeVerification: wrap(sync.completeVerification),
      ledger: wrap(sync.ledger),
      donations: wrap(sync.donations),
      confirmTransfer: wrap(sync.confirmTransfer),
      refunds: wrap(sync.refunds),
      requestRefund: wrap(sync.requestRefund),
      approveRefund: wrap(sync.approveRefund),
      payouts: wrap(sync.payouts),
      requestPayout: wrap(sync.requestPayout),
      approvePayout: wrap(sync.approvePayout),
      markPayoutPaid: wrap(sync.markPayoutPaid),
      donors: wrap(sync.donors),
      volunteers: wrap(sync.volunteers),
      team: wrap(sync.team),
      updateRoles: wrap(sync.updateRoles),
      audit: wrap(sync.audit),
      sentMessages: wrap(sync.sentMessages),
    };
  };

  // ---------------------------------------------------------------- case submission

  const UPLOAD_TYPES: Readonly<Record<string, string>> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
  };
  const uploads = new Set<string>();
  const nationalIds = new Set<string>();

  /** Same rules as POST /uploads: PDFs and photos up to 20 MB, a 10-minute link, keys scoped to the uploader. */
  const presignUpload = (input: { kind: DocumentKind; contentType: string; sizeBytes: number }): UploadTicket => {
    const extension = UPLOAD_TYPES[input.contentType];
    if (!extension) throw new DomainError('VALIDATION_FAILED', 'Upload a PDF or a photo', { field: 'contentType' });
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > 20 * 1024 * 1024) {
      throw new DomainError('VALIDATION_FAILED', 'Files are limited to 20 MB', { field: 'sizeBytes' });
    }
    state.seq.upload += 1;
    const key = `uploads/${ME}/${String(state.seq.upload).padStart(6, '0')}-${input.kind}.${extension}`;
    uploads.add(key);
    return {
      key,
      url: `https://storage.yusr.invalid/private/${key}`,
      headers: { 'content-type': input.contentType, 'content-length': String(input.sizeBytes) },
      expiresAt: iso(clock() + 600_000),
    };
  };

  const pick = (text: { ar?: string; en?: string } | null | undefined): Localized | null => {
    const ar = text?.ar?.trim() || text?.en?.trim() || '';
    const en = text?.en?.trim() || ar;
    return ar ? { ar, en } : null;
  };

  const submitCase = (request: SubmitCaseRequest): SubmitCaseResult => {
    if (request.consent !== true) throw new DomainError('VALIDATION_FAILED', 'Consent is required', { field: 'consent' });
    for (const document of request.documents) {
      if (!uploads.has(document.storageKey)) throw new DomainError('FORBIDDEN', 'Documents must be uploaded by the submitter');
    }
    const title = pick(request.title);
    const storyText = pick(request.story);
    if (!title || !storyText) throw new DomainError('VALIDATION_FAILED', 'Title and story are required', { fields: ['title', 'story'] });
    const nationalId = request.beneficiary.nationalId?.replace(/\D/g, '') || null;
    const possibleDuplicate = Boolean(nationalId && nationalIds.has(nationalId));
    if (nationalId) nationalIds.add(nationalId);
    state.seq.case += 1;
    const ref = state.seq.case;
    const at = clock();
    const id = `case_${ref}`;
    const text: Localized = title;
    const item: AdminCase = {
      id,
      slug: `submitted-${ref}`,
      reference: `YSR-${ref}`,
      category: request.category,
      status: 'under_review',
      title: text,
      summary: { ar: storyText.ar.slice(0, 140), en: storyText.en.slice(0, 140) },
      shareText: null,
      partner:
        request.submitterRelation === 'association' && request.association
          ? { name: request.association.name, registrationNumber: request.association.registrationNumber }
          : null,
      region: request.region,
      currency: request.currency,
      goalMinor: caseAmountsFor(request.goalMinor).goalMinor,
      platformFeeMinor: caseAmountsFor(request.goalMinor).platformFeeMinor,
      raisedMinor: 0,
      donorsCount: 0,
      isUrgent: request.isUrgent,
      deadline: request.deadline,
      zakatEligible: request.category !== 'education',
      verifiedAt: null,
      publishedAt: null,
      fundedAt: null,
      priority: 0,
      coverSeed: ref % 997,
      createdAt: iso(at),
      story: storyText,
      beneficiary: pick(request.beneficiary.pseudonym) ?? { ar: 'مقدّم الطلب', en: 'Applicant' },
      documents: request.documents.map((document, index) => ({
        id: `${id}_d${index + 1}`,
        kind: document.kind,
        title: DOCUMENT_TITLES[document.kind] ?? DOCUMENT_TITLES.national_id,
        pages: 1,
        redacted: false,
        verifiedBy: { ar: '—', en: '—' },
        issuedAt: iso(at),
      })),
      timeline: [
        {
          kind: 'submitted',
          at: iso(at),
          actor: request.association
            ? { ar: request.association.name, en: request.association.name }
            : { ar: CURRENT_DONOR.name.ar, en: CURRENT_DONOR.name.en },
        },
        { kind: 'review_started', at: iso(at + 1_000), actor: CONTENT_TEAM },
      ],
      disbursements: [],
      updates: [],
      recentDonations: [],
      submittedBy: {
        name: request.association?.name ?? CURRENT_DONOR.name.ar,
        relation: request.submitterRelation,
        association: request.submitterRelation === 'association' ? (request.association ?? null) : null,
      },
      auditor: null,
      history: [
        { from: null, to: 'draft', at: iso(at), actorName: CURRENT_DONOR.name.ar, reason: null },
        { from: 'draft', to: 'under_review', at: iso(at + 1_000), actorName: CURRENT_DONOR.name.ar, reason: null },
      ],
      updatedAt: iso(at),
    };
    putCase(item);
    logAudit(
      { id: ME, name: CURRENT_DONOR.name.ar, role: request.submitterRelation === 'volunteer' ? 'volunteer' : 'beneficiary' },
      'case.submitted',
      'case',
      id,
      item.reference,
      null,
      { status: 'under_review', possibleDuplicate },
    );
    emit({ type: 'case.updated', caseId: id });
    // Duplicates are flagged for reviewers only (audit log), never to the submitter.
    return { id, reference: item.reference, status: item.status };
  };

  // ---------------------------------------------------------------- live simulation

  let liveTimer: ReturnType<typeof setTimeout> | null = null;
  const [minDelay, maxDelay] = options.liveIntervalMs ?? [5_000, 11_000];

  const tick = (): AdminDonation | null => {
    const open = [...state.cases.values()].filter((item) => item.status === 'published');
    if (open.length === 0) return null;
    const target = live.weighted(open.map((item) => [item, (item.isUrgent ? 3 : 1) * (item.raisedMinor / item.goalMinor > 0.8 ? 2 : 1)] as const));
    const donor = pickDonor(live);
    const currency = donorCurrency(donor, target.currency);
    const method = pickMethod(currency, live);
    const anonymous = live.chance(0.25);
    const at = clock();
    const response = createDonation(
      {
        caseId: target.id,
        amountMinor: toMinor(quickAmount(currency, live), currency),
        currency,
        method: method === 'instapay' || method === 'fawry' ? 'card' : method,
        coverFees: live.chance(0.5),
        anonymous,
        type: target.zakatEligible && live.chance(0.4) ? 'zakat' : 'sadaqah',
        locale: 'ar',
      },
      {
        donorId: donor.id,
        displayName: anonymous ? null : donor.name,
        region: donor.region,
        channel: live.chance(0.55) ? 'mobile' : 'web',
        at,
        userId: 'guest',
      },
    );
    const record = mustDonation(response.donationId);
    record.donorName = donor.name.ar;
    record.userId = null;
    return settle(record, at + 1, undefined, true);
  };

  const scheduleLive = () => {
    liveTimer = setTimeout(
      () => {
        try {
          tick();
        } finally {
          if (liveTimer !== null) scheduleLive();
        }
      },
      minDelay + live.next() * (maxDelay - minDelay),
    );
  };

  // ---------------------------------------------------------------- async public client

  const client: YusrClient = {
    stats: async () => read.stats(),
    listCases: async (filters) => read.cases(filters),
    getCase: async (slug) => read.caseBySlug(slug),
    liveDonations: async (limit) => read.live(limit),
    createDonation: async (request) => createDonation(request, { userId: ME, displayName: CURRENT_DONOR.name, region: CURRENT_DONOR.region }),
    getDonation: async (id) => mustDonation(id),
    myDonations: async () => read.myDonations(),
    myNotifications: async () => read.myNotifications(),
    presignUpload: async (input) => presignUpload(input),
    submitCase: async (request) => submitCase(request),
  };

  return {
    read,
    client,
    admin: toAsyncAdmin,
    createDonation,
    completePayment,
    presignUpload,
    submitCase,
    simulate: {
      tick,
      startLive: () => {
        if (liveTimer === null) {
          liveTimer = setTimeout(() => undefined, 0);
          scheduleLive();
        }
      },
      stopLive: () => {
        if (liveTimer !== null) clearTimeout(liveTimer);
        liveTimer = null;
      },
      isLive: () => liveTimer !== null,
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
    now: clock,
    staff: STAFF,
    currentDonor: CURRENT_DONOR,
  };
}

// ------------------------------------------------------------------ read models

function createReadApi(state: State, clock: () => number, cached: <T>(key: string, compute: () => T) => T) {
  const publicCases = () => cached('publicCases', () => [...state.cases.values()].filter((item) => isPubliclyVisible(item.status)).map(toSummary));

  const succeeded = () => cached('succeeded', () => state.donations.filter((record) => record.status === 'succeeded'));

  const publicDonation = (record: DonationRecord): PublicDonation => ({
    id: record.id,
    displayName: record.anonymous || !record.displayName ? null : record.displayName.ar,
    // The gift as the donor chose it, expressed in the case currency (fees are shown on receipts).
    amountMinor: convertMinor(record.amountMinor, record.currency, record.caseCurrency, DEMO_FX),
    createdAt: record.succeededAt ?? record.createdAt,
  });

  const api = {
    stats: (): PlatformStats =>
      cached('stats', () => {
        const donations = succeeded();
        const raised = donations.reduce((sum, record) => sum + egp(record.netToCaseMinor, record.caseCurrency), 0);
        const donors = new Set(donations.map((record) => record.donorId ?? record.id)).size;
        const fundedCases = [...state.cases.values()].filter((item) => item.status === 'funded' || item.status === 'closed');
        return {
          raisedMinor: BASELINE.raisedMinor + raised,
          casesFunded: BASELINE.casesFunded + fundedCases.length,
          donors: BASELINE.donors + donors,
          regionsCovered: 27,
          medianHoursToFund: api.overview().kpis.medianHoursToFund,
        };
      }),

    cases: (filters: CaseFilters = {}): Page<CaseSummary> => queryCases(publicCases(), filters),

    caseBySlug: (slug: string): CaseDetail | null =>
      cached(`case:${slug}`, () => {
        const item = [...state.cases.values()].find((entry) => entry.slug === slug);
        if (!item || !isPubliclyVisible(item.status)) return null;
        const recent = state.donations
          .filter((record) => record.caseId === item.id && record.status === 'succeeded')
          .slice(-12)
          .reverse()
          .map(publicDonation);
        const { submittedBy: _s, auditor: _a, history: _h, updatedAt: _u, ...detail } = item;
        return { ...detail, recentDonations: recent };
      }),

    adminCases: (): AdminCase[] =>
      cached('adminCases', () => [...state.cases.values()].sort((a, b) => b.priority - a.priority || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))),

    adminCase: (id: string): AdminCase | undefined => state.cases.get(id),

    live: (limit = 12): LiveDonation[] =>
      cached(`live:${limit}`, () =>
        succeeded()
          .slice(-limit)
          .reverse()
          .map((record) => ({
            id: record.id,
            at: record.succeededAt ?? record.createdAt,
            displayName: record.anonymous ? null : record.displayName,
            amountMinor: record.amountMinor,
            currency: record.currency,
            caseSlug: record.caseSlug,
            caseTitle: record.caseTitle,
            region: record.region,
          })),
      ),

    donation: (id: string): DonationRecord | undefined => state.donations.find((record) => record.id === id),

    donations: (filter?: { status?: AdminDonation['status'] }): DonationRecord[] =>
      cached(`donations:${filter?.status ?? '*'}`, () =>
        state.donations
          .filter((record) => !filter?.status || record.status === filter.status)
          .slice()
          .reverse(),
      ),

    myDonations: (): DonationRecord[] =>
      cached('mine', () =>
        state.donations
          .filter((record) => record.userId === ME)
          .slice()
          .reverse(),
      ),

    myNotifications: (): DonorNotification[] => cached('notifications', () => [...state.notifications].reverse()),

    ledger: (query: LedgerQuery = {}): LedgerLine[] =>
      cached(`ledger:${query.limit ?? 200}:${query.kind ?? '*'}:${query.account ?? '*'}`, () => {
        const result: LedgerLine[] = [];
        for (let i = state.ledger.length - 1; i >= 0 && result.length < (query.limit ?? 200); i -= 1) {
          const line = state.ledger[i]!;
          if (query.kind && line.kind !== query.kind) continue;
          if (query.account && !line.account.startsWith(query.account)) continue;
          result.push(line);
        }
        return result;
      }),

    ledgerBalance: (): LedgerBalance =>
      cached('ledgerBalance', () => {
        const totals = new Map<Currency, { debitMinor: number; creditMinor: number }>();
        for (const line of state.ledger) {
          const entry = totals.get(line.currency) ?? { debitMinor: 0, creditMinor: 0 };
          if (line.direction === 'debit') entry.debitMinor += line.amountMinor;
          else entry.creditMinor += line.amountMinor;
          totals.set(line.currency, entry);
        }
        const byCurrency = [...totals.entries()].map(([currency, value]) => ({ currency, ...value }));
        return { byCurrency, balanced: byCurrency.every((entry) => entry.debitMinor === entry.creditMinor), lines: state.ledger.length };
      }),

    accountBalances: () =>
      cached('accountBalances', () => {
        const balances = new Map<string, { account: string; currency: Currency; balanceMinor: number }>();
        for (const line of state.ledger) {
          const key = `${line.account}|${line.currency}`;
          const entry = balances.get(key) ?? { account: line.account, currency: line.currency, balanceMinor: 0 };
          const debitNormal = line.account.startsWith('asset') || line.account.startsWith('expense');
          const signed = line.direction === 'debit' ? line.amountMinor : -line.amountMinor;
          entry.balanceMinor += debitNormal ? signed : -signed;
          balances.set(key, entry);
        }
        return [...balances.values()];
      }),

    payouts: (): Payout[] => cached('payouts', () => [...state.payouts].reverse()),
    refunds: (): Refund[] => cached('refunds', () => [...state.refunds].reverse()),
    audit: (limit = 100): AuditEntry[] => cached(`audit:${limit}`, () => state.audit.slice(-limit).reverse()),
    tasks: (): VerificationTask[] => cached('tasks', () => [...state.tasks]),
    team: (): TeamMember[] => cached('team', () => [...state.team]),

    overview: (): AdminOverview =>
      cached('overview', () => {
        const now = clock();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(now);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const since30 = now - 30 * DAY;
        const donations = succeeded();
        const at = (record: DonationRecord) => Date.parse(record.succeededAt ?? record.createdAt);
        const charged = (record: DonationRecord) => egp(record.chargedMinor, record.currency);

        const todayList = donations.filter((record) => at(record) >= today.getTime());
        const monthList = donations.filter((record) => at(record) >= monthStart.getTime());
        const recent = donations.filter((record) => at(record) >= since30);

        const series = new Map<string, { amountMinor: number; count: number }>();
        for (let d = 29; d >= 0; d -= 1) series.set(localDayKey(now - d * DAY), { amountMinor: 0, count: 0 });
        for (const record of recent) {
          const bucket = series.get(localDayKey(at(record)));
          if (bucket) {
            bucket.amountMinor += charged(record);
            bucket.count += 1;
          }
        }

        const byMethod = new Map<PaymentMethod, { amountMinor: number; count: number }>();
        const byCategory = new Map<CaseCategory, number>();
        for (const record of recent) {
          const method = byMethod.get(record.method) ?? { amountMinor: 0, count: 0 };
          method.amountMinor += charged(record);
          method.count += 1;
          byMethod.set(record.method, method);
          const category = state.cases.get(record.caseId)!.category;
          byCategory.set(category, (byCategory.get(category) ?? 0) + charged(record));
        }

        const cases = [...state.cases.values()];
        const fundHours = cases
          .filter((item) => item.fundedAt && item.publishedAt)
          .map((item) => (Date.parse(item.fundedAt!) - Date.parse(item.publishedAt!)) / HOUR);

        const activity: ActivityItem[] = [
          ...donations.slice(-10).map<ActivityItem>((record) => ({
            id: record.id,
            at: record.succeededAt ?? record.createdAt,
            kind: 'donation',
            actorName: record.anonymous ? null : record.displayName,
            caseTitle: record.caseTitle,
            amountMinor: record.amountMinor,
            currency: record.currency,
            status: null,
          })),
          ...state.audit
            .filter((entry) => entry.entityType === 'case' || entry.entityType === 'payout')
            .slice(-8)
            .map<ActivityItem>((entry) => {
              const item = entry.entityType === 'case' ? state.cases.get(entry.entityId) : undefined;
              const payout = entry.entityType === 'payout' ? state.payouts.find((p) => p.id === entry.entityId) : undefined;
              return {
                id: entry.id,
                at: entry.at,
                kind: entry.entityType === 'payout' ? 'payout' : 'case',
                actorName: {
                  ar: entry.actor.name === 'system' ? SYSTEM_NAME.ar : entry.actor.name,
                  en: entry.actor.name === 'system' ? SYSTEM_NAME.en : entry.actor.name,
                },
                caseTitle: item?.title ?? payout?.caseTitle ?? null,
                amountMinor: payout?.amountMinor ?? null,
                currency: payout?.currency ?? null,
                status: (entry.after?.status as CaseStatus | undefined) ?? null,
              };
            }),
        ]
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
          .slice(0, 12);

        return {
          kpis: {
            donationsTodayMinor: todayList.reduce((sum, record) => sum + charged(record), 0),
            donationsTodayCount: todayList.length,
            donationsMonthMinor: monthList.reduce((sum, record) => sum + charged(record), 0),
            activeCases: cases.filter((item) => item.status === 'published').length,
            pendingReview: cases.filter((item) => item.status === 'under_review' || item.status === 'field_verified').length,
            awaitingTransfers: state.donations.filter((record) => record.status === 'awaiting_transfer').length,
            medianHoursToFund: Math.round(median(fundHours)) || 41,
            feesMonthMinor: monthList.reduce((sum, record) => sum + egp(record.feeMinor, record.currency), 0),
            refundsOpen: state.refunds.filter((refund) => refund.status === 'requested' || refund.status === 'approved').length,
          },
          series: [...series.entries()].map(([date, value]) => ({ date, ...value })),
          byMethod: [...byMethod.entries()].map(([method, value]) => ({ method, ...value })).sort((a, b) => b.amountMinor - a.amountMinor),
          byCategory: [...byCategory.entries()].map(([category, amountMinor]) => ({ category, amountMinor })).sort((a, b) => b.amountMinor - a.amountMinor),
          activity,
        };
      }),

    donors: (): DonorRow[] =>
      cached('donors', () => {
        const now = clock();
        const rows = new Map<string, { total: number; count: number; last: number; first: number; name: Localized; region: string }>();
        for (const record of succeeded()) {
          const id = record.donorId ?? record.id;
          const seedDonor = DONORS.find((donor) => donor.id === id);
          const name = id === ME ? CURRENT_DONOR.name : (seedDonor?.name ?? { ar: record.donorName ?? '—', en: record.donorName ?? '—' });
          const at = Date.parse(record.succeededAt ?? record.createdAt);
          const row = rows.get(id) ?? { total: 0, count: 0, last: 0, first: Number.POSITIVE_INFINITY, name, region: record.region };
          row.total += egp(record.chargedMinor, record.currency);
          row.count += 1;
          row.last = Math.max(row.last, at);
          row.first = Math.min(row.first, at);
          rows.set(id, row);
        }
        return [...rows.entries()]
          .map<DonorRow>(([id, row]) => ({
            id,
            name: row.name,
            region: row.region,
            totalMinor: row.total,
            donationsCount: row.count,
            lastDonationAt: new Date(row.last).toISOString(),
            segment: row.total >= 20_000_00 ? 'major' : now - row.last > 25 * DAY ? 'lapsed' : now - row.first < 14 * DAY ? 'new' : 'recurring',
            contactMasked: id === ME ? maskContact(CURRENT_DONOR.email) : maskContact(`+2010${id.replace(/\D/g, '').padStart(8, '4')}`),
          }))
          .sort((a, b) => b.totalMinor - a.totalMinor);
      }),

    volunteers: (): VolunteerRow[] =>
      cached('volunteers', () =>
        VOLUNTEERS.map((volunteer, index) => ({
          id: volunteer.id,
          name: volunteer.name,
          region: volunteer.region,
          casesSubmitted: volunteer.cases,
          visitsDone: volunteer.visits,
          status: volunteer.status,
          contactMasked: maskContact(`+2011${String(index * 7_331_117).padStart(8, '5')}`),
          joinedAt: new Date(clock() - (index + 3) * 47 * DAY).toISOString(),
        })),
      ),
  };
  return api;
}
