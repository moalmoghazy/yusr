/**
 * Persistence ports. Services depend on these interfaces only, never on Drizzle or
 * NestJS, so the money logic is tested against the in-memory adapter (db/memory.ts)
 * and runs in production against PostgreSQL (db/drizzle.ts) unchanged.
 */
import type { CaseFilters, CaseStatus, Currency, PaymentProvider } from '@yusr/core';
import type {
  AuditInput,
  AuditRow,
  AuthIdentityRow,
  BeneficiaryRow,
  CaseDocumentRow,
  CaseFundSummary,
  CaseRow,
  CaseTransitionRow,
  DisbursementLineRow,
  DonationRow,
  Id,
  JournalEntryInput,
  JournalLineRow,
  NotificationRow,
  OutboxInput,
  OutboxRow,
  PaymentAttemptRow,
  PayoutRow,
  RefreshTokenRow,
  RefundRow,
  UserRow,
  VerificationTaskRow,
  VolunteerProfileRow,
  WebhookEventRow,
} from './rows';

export type LockMode = 'update' | 'share';

export interface UsersRepo {
  byId(id: Id): Promise<UserRow | null>;
  byPhone(phone: string): Promise<UserRow | null>;
  byEmail(email: string): Promise<UserRow | null>;
  insert(row: UserRow): Promise<void>;
  update(id: Id, patch: Partial<Omit<UserRow, 'id'>>): Promise<void>;
  staff(): Promise<UserRow[]>;
  identity(provider: AuthIdentityRow['provider'], subject: string): Promise<AuthIdentityRow | null>;
  insertIdentity(row: AuthIdentityRow): Promise<void>;
  insertVolunteer(row: VolunteerProfileRow): Promise<void>;
}

export interface RefreshTokensRepo {
  byHash(tokenHash: string, lock?: LockMode): Promise<RefreshTokenRow | null>;
  insert(row: RefreshTokenRow): Promise<void>;
  markReplaced(id: Id, replacedBy: Id, at: Date): Promise<void>;
  revokeFamily(familyId: Id, at: Date): Promise<number>;
}

export interface CasePage {
  items: CaseRow[];
  total: number;
  nextCursor: string | null;
}

export interface CasesRepo {
  byId(id: Id, lock?: LockMode): Promise<CaseRow | null>;
  bySlug(slug: string): Promise<CaseRow | null>;
  search(filters: CaseFilters & { statuses: readonly CaseStatus[] }): Promise<CasePage>;
  insert(row: Omit<CaseRow, 'reference'> & { reference?: string }): Promise<CaseRow>;
  update(id: Id, patch: Partial<Omit<CaseRow, 'id' | 'reference'>>): Promise<void>;
  /** Changes status; `system` marks platform-only transitions (published → funded) for the database guard. */
  setStatus(id: Id, to: CaseStatus, options?: { system?: boolean }): Promise<CaseRow>;
  /** Adds to raised_minor and donors_count atomically and returns the new totals. */
  credit(id: Id, amountMinor: number, donors: number): Promise<Pick<CaseRow, 'raisedMinor' | 'goalMinor' | 'status' | 'donorsCount'>>;
  insertTransition(row: Omit<CaseTransitionRow, 'id' | 'createdAt'> & { createdAt?: Date }): Promise<void>;
  transitions(caseId: Id): Promise<CaseTransitionRow[]>;
  documents(caseId: Id): Promise<CaseDocumentRow[]>;
  insertDocument(row: CaseDocumentRow): Promise<void>;
  updateDocument(id: Id, patch: Partial<Pick<CaseDocumentRow, 'redactedKey' | 'redactedBy' | 'pages'>>): Promise<void>;
  document(id: Id): Promise<CaseDocumentRow | null>;
  lines(caseId: Id): Promise<DisbursementLineRow[]>;
  line(id: Id): Promise<DisbursementLineRow | null>;
  insertLines(rows: readonly DisbursementLineRow[]): Promise<void>;
  beneficiary(id: Id): Promise<BeneficiaryRow | null>;
  beneficiaryByNationalIdHash(hash: string): Promise<BeneficiaryRow | null>;
  insertBeneficiary(row: BeneficiaryRow): Promise<void>;
}

export interface VerificationRepo {
  byId(id: Id, lock?: LockMode): Promise<VerificationTaskRow | null>;
  openForCase(caseId: Id): Promise<VerificationTaskRow | null>;
  list(filter?: { auditorId?: Id; open?: boolean }): Promise<VerificationTaskRow[]>;
  insert(row: VerificationTaskRow): Promise<void>;
  update(id: Id, patch: Partial<Omit<VerificationTaskRow, 'id'>>): Promise<void>;
}

export interface DonationsRepo {
  byId(id: Id, lock?: LockMode): Promise<DonationRow | null>;
  byReceipt(receiptNo: string, lock?: LockMode): Promise<DonationRow | null>;
  byIdempotencyKey(key: string): Promise<DonationRow | null>;
  insert(row: DonationRow): Promise<void>;
  update(id: Id, patch: Partial<Omit<DonationRow, 'id'>>): Promise<void>;
  /** Next number of the yearly receipt series, incremented inside the caller's transaction. */
  nextReceiptSequence(year: number): Promise<number>;
  forDonor(donorId: Id, limit: number): Promise<DonationRow[]>;
  recentForCase(caseId: Id, limit: number): Promise<DonationRow[]>;
  /** Everyone who gave to a case successfully (one row per donor or guest contact), for impact updates. */
  contactsForCase(caseId: Id): Promise<Array<Pick<DonationRow, 'donorId' | 'guestContact' | 'locale' | 'id'>>>;
  list(filter: { status?: DonationRow['status']; limit: number }): Promise<DonationRow[]>;
  /** Stale checkouts whose window has passed (pending, requires_action, awaiting_transfer). */
  expirable(before: Date, limit: number): Promise<DonationRow[]>;
  latestAttempt(donationId: Id): Promise<PaymentAttemptRow | null>;
  attemptByProviderRef(provider: PaymentProvider, providerRef: string): Promise<PaymentAttemptRow | null>;
  /** The attempt whose checkout created this provider order (see PaymentAttemptRow.providerOrderRef). */
  attemptByOrderRef(provider: PaymentProvider, providerOrderRef: string): Promise<PaymentAttemptRow | null>;
  insertAttempt(row: PaymentAttemptRow): Promise<void>;
  updateAttempt(id: Id, patch: Partial<Omit<PaymentAttemptRow, 'id'>>): Promise<void>;
}

export interface WebhooksRepo {
  /** Records a verified event; returns false when this (provider, eventId) was seen before. */
  record(row: WebhookEventRow): Promise<boolean>;
  finish(provider: PaymentProvider, eventId: string, error: string | null, at: Date): Promise<void>;
}

export interface LedgerRepo {
  /** Creates missing accounts, inserts the entry and its lines. The store refuses unbalanced entries. */
  post(entry: JournalEntryInput): Promise<Id>;
  ensureCaseFund(caseId: Id, currency: Currency): Promise<string>;
  caseFund(caseId: Id): Promise<CaseFundSummary[]>;
  lines(filter: { limit: number; kind?: JournalLineRow['kind']; accountPrefix?: string }): Promise<JournalLineRow[]>;
  balance(account: string, currency: Currency): Promise<number>;
}

export interface PayoutsRepo {
  byId(id: Id, lock?: LockMode): Promise<PayoutRow | null>;
  forCase(caseId: Id): Promise<PayoutRow[]>;
  list(filter?: { status?: PayoutRow['status'] }): Promise<PayoutRow[]>;
  insert(row: PayoutRow): Promise<void>;
  update(id: Id, patch: Partial<Omit<PayoutRow, 'id'>>): Promise<void>;
}

export interface RefundsRepo {
  byId(id: Id, lock?: LockMode): Promise<RefundRow | null>;
  forDonation(donationId: Id): Promise<RefundRow[]>;
  list(filter?: { status?: RefundRow['status'] }): Promise<RefundRow[]>;
  insert(row: RefundRow): Promise<void>;
  update(id: Id, patch: Partial<Omit<RefundRow, 'id'>>): Promise<void>;
}

export interface OutboxRepo {
  enqueue(event: OutboxInput): Promise<void>;
  /** Claims due events (FOR UPDATE SKIP LOCKED in PostgreSQL) and marks them processing. */
  claim(limit: number, now: Date): Promise<OutboxRow[]>;
  markSent(id: number): Promise<void>;
  markFailed(id: number, error: string, retryAt: Date | null): Promise<void>;
}

export interface AuditRepo {
  record(entry: AuditInput): Promise<void>;
  list(filter: { limit: number; entityType?: string; entityId?: string }): Promise<AuditRow[]>;
}

export interface NotificationsRepo {
  /** Idempotent: a row whose id already exists is left as is (ON CONFLICT DO NOTHING). */
  insert(row: NotificationRow): Promise<void>;
  forUser(userId: Id, limit: number): Promise<NotificationRow[]>;
  markRead(userId: Id, ids: readonly Id[], at: Date): Promise<void>;
}

/** EGP per unit of each currency, for dashboards that add up money across currencies. */
export type RatesToEgp = Readonly<Record<Currency, number>>;

export interface DonationTotals {
  count: number;
  /** Credited to cases, in EGP minor units. */
  amountEgpMinor: number;
  /** Processing fees actually charged, in EGP minor units. */
  feesEgpMinor: number;
}

/** Aggregates for the control hub. SQL GROUP BYs in PostgreSQL, loops in memory. */
export interface ReportsRepo {
  donationTotals(since: Date, rates: RatesToEgp): Promise<DonationTotals>;
  dailySeries(since: Date, rates: RatesToEgp): Promise<Array<{ date: string; amountMinor: number; count: number }>>;
  byMethod(since: Date, rates: RatesToEgp): Promise<Array<{ method: DonationRow['method']; amountMinor: number; count: number }>>;
  byCategory(since: Date, rates: RatesToEgp): Promise<Array<{ category: CaseRow['category']; amountMinor: number }>>;
  caseCounts(): Promise<Partial<Record<CaseStatus, number>>>;
  donationCounts(): Promise<Partial<Record<DonationRow['status'], number>>>;
  medianHoursToFund(): Promise<number>;
  donors(rates: RatesToEgp): Promise<Array<{ donorId: Id; donationsCount: number; givenEgpMinor: number; firstAt: Date; lastAt: Date }>>;
  volunteers(): Promise<
    Array<{ userId: Id; status: 'onboarding' | 'active' | 'paused'; region: string; joinedAt: Date; casesSubmitted: number; visitsDone: number }>
  >;
}

/** Everything a service may touch inside one database transaction. */
export interface Tx {
  users: UsersRepo;
  refreshTokens: RefreshTokensRepo;
  cases: CasesRepo;
  verification: VerificationRepo;
  donations: DonationsRepo;
  webhooks: WebhooksRepo;
  ledger: LedgerRepo;
  payouts: PayoutsRepo;
  refunds: RefundsRepo;
  outbox: OutboxRepo;
  audit: AuditRepo;
  notifications: NotificationsRepo;
  reports: ReportsRepo;
}

export interface Database {
  /** Runs `work` in one transaction (READ COMMITTED + row locks where the repos ask for them). */
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  /** Non-transactional reads. */
  read: Tx;
}

export const DATABASE = Symbol('DATABASE');
