/**
 * Row shapes the services work with — camelCase mirrors of the tables in
 * migrations/0000_init.sql. Both storage adapters (Drizzle/PostgreSQL and the
 * in-memory demo store) read and write exactly these.
 */
import type {
  CaseCategory,
  CaseStatus,
  CheckoutAction,
  Currency,
  DocumentKind,
  DonationStatus,
  DonationType,
  Locale,
  Localized,
  PayeeType,
  PaymentMethod,
  PartnerAssociation,
  PaymentProvider,
  Role,
  SubmitterRelation,
} from '@yusr/core';

export type Id = string;
export type Timestamp = Date;

export interface UserRow {
  id: Id;
  phone: string | null;
  email: string | null;
  displayName: string;
  locale: Locale;
  roles: Role[];
  region: string | null;
  mfaEnabled: boolean;
  /** Encrypted authenticator (TOTP) secret; staff only. */
  totpSecretCipher: Uint8Array | null;
  marketingOptIn: boolean;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuthIdentityRow {
  id: Id;
  userId: Id;
  provider: 'phone' | 'google' | 'apple' | 'email';
  subject: string;
  createdAt: Timestamp;
}

export interface VolunteerProfileRow {
  userId: Id;
  status: 'onboarding' | 'active' | 'paused';
  region: string;
  skills: string[];
  baserowRowId: number | null;
  joinedAt: Timestamp;
}

export interface RefreshTokenRow {
  id: Id;
  userId: Id;
  familyId: Id;
  tokenHash: string;
  /** The login passed a second factor; kept server-side so a client cannot upgrade itself. */
  mfa: boolean;
  replacedBy: Id | null;
  revokedAt: Timestamp | null;
  expiresAt: Timestamp;
  userAgent: string | null;
  createdAt: Timestamp;
}

export interface CaseRow {
  id: Id;
  reference: string;
  slug: string;
  category: CaseCategory;
  status: CaseStatus;
  beneficiaryId: Id;
  submittedBy: Id;
  submitterRelation: SubmitterRelation;
  /** The partner association that submitted the case (0002_partner_association.sql); null for individuals. */
  association: PartnerAssociation | null;
  title: Localized;
  summary: Localized;
  /** «نص المشاركة»: the case's own line for social sharing; null = composed from title and category. */
  shareText: Localized | null;
  story: Localized;
  region: string;
  currency: Currency;
  /** What donors are asked for: the partner's need plus Yusr's fee. */
  goalMinor: number;
  /** Yusr's 10% inside the goal; the disbursement plan adds up to the rest. */
  platformFeeMinor: number;
  raisedMinor: number;
  donorsCount: number;
  isUrgent: boolean;
  deadline: Timestamp | null;
  zakatEligible: boolean;
  priority: number;
  coverSeed: number;
  auditorId: Id | null;
  verifiedAt: Timestamp | null;
  publishedAt: Timestamp | null;
  fundedAt: Timestamp | null;
  closedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BeneficiaryRow {
  id: Id;
  pseudonym: Localized;
  nationalIdHash: string | null;
  nationalIdCipher: Uint8Array | null;
  phoneCipher: Uint8Array | null;
  region: string;
  householdSize: number | null;
  createdAt: Timestamp;
}

export interface CaseDocumentRow {
  id: Id;
  caseId: Id;
  kind: DocumentKind;
  storageKey: string;
  redactedKey: string | null;
  sha256: string;
  pages: number;
  uploadedBy: Id;
  redactedBy: Id | null;
  createdAt: Timestamp;
}

export interface CaseTransitionRow {
  id: number;
  caseId: Id;
  fromStatus: CaseStatus;
  toStatus: CaseStatus;
  actorId: Id | null;
  reason: string | null;
  createdAt: Timestamp;
}

export type ChecklistKey = 'identity' | 'residence' | 'documents' | 'cost' | 'alternatives';

export interface VerificationTaskRow {
  id: Id;
  caseId: Id;
  auditorId: Id;
  assignedBy: Id;
  status: 'assigned' | 'scheduled' | 'completed' | 'cancelled';
  visitAt: Timestamp | null;
  checklist: Record<ChecklistKey, boolean>;
  recommendedMinor: number | null;
  notes: string | null;
  baserowRowId: number | null;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface DisbursementLineRow {
  id: Id;
  caseId: Id;
  payeeType: PayeeType;
  payee: Localized;
  purpose: Localized;
  amountMinor: number;
  payeeAccountMasked: string | null;
  position: number;
}

export interface GuestContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface DonationRow {
  id: Id;
  caseId: Id;
  donorId: Id | null;
  guestContact: GuestContact | null;
  idempotencyKey: string;
  requestHash: string;
  type: DonationType;
  anonymous: boolean;
  dedication: string | null;
  currency: Currency;
  amountMinor: number;
  coverFees: boolean;
  estimatedFeeMinor: number;
  feeMinor: number | null;
  chargedMinor: number;
  caseCurrency: Currency;
  fxRate: number;
  netToCaseMinor: number;
  method: PaymentMethod;
  provider: PaymentProvider;
  status: DonationStatus;
  receiptNo: string;
  receiptTokenHash: string;
  locale: Locale;
  channel: 'web' | 'mobile' | 'admin';
  expiresAt: Timestamp;
  succeededAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AttemptStatus = 'created' | 'action_required' | 'captured' | 'failed' | 'refunded';

export interface PaymentAttemptRow {
  id: Id;
  donationId: Id;
  provider: PaymentProvider;
  providerRef: string | null;
  status: AttemptStatus;
  amountMinor: number;
  currency: Currency;
  action: CheckoutAction | null;
  failureCode: string | null;
  createdAt: Timestamp;
}

export interface WebhookEventRow {
  id: Id;
  provider: PaymentProvider;
  eventId: string;
  signatureValid: boolean;
  payload: unknown;
  receivedAt: Timestamp;
  processedAt: Timestamp | null;
  error: string | null;
}

export type PayoutStatus = 'requested' | 'approved' | 'paid' | 'rejected';

export interface PayoutRow {
  id: Id;
  reference: string;
  caseId: Id;
  lineId: Id;
  amountMinor: number;
  currency: Currency;
  payeeAccountMasked: string;
  status: PayoutStatus;
  requestedBy: Id;
  approvedBy: Id | null;
  approvedAt: Timestamp | null;
  paidAt: Timestamp | null;
  bankReference: string | null;
  proofDocumentId: Id | null;
  createdAt: Timestamp;
}

export type RefundStatus = 'requested' | 'approved' | 'processed' | 'rejected';

export interface RefundRow {
  id: Id;
  donationId: Id;
  amountMinor: number;
  reason: string;
  status: RefundStatus;
  requestedBy: Id;
  approvedBy: Id | null;
  providerRef: string | null;
  processedAt: Timestamp | null;
  createdAt: Timestamp;
}

export type EntryKind = 'donation' | 'refund' | 'payout' | 'settlement' | 'adjustment' | 'platform_fee';

export interface JournalLineInput {
  account: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currency: Currency;
  memo?: string;
}

export interface JournalEntryInput {
  kind: EntryKind;
  memo?: string | null;
  donationId?: Id | null;
  payoutId?: Id | null;
  refundId?: Id | null;
  postedBy?: Id | null;
  /** Only for backfills and seeds; live postings take the database clock. */
  postedAt?: Timestamp;
  lines: readonly JournalLineInput[];
}

export interface JournalLineRow extends JournalLineInput {
  id: number;
  entryId: Id;
  kind: EntryKind;
  postedAt: Timestamp;
  reference: string | null;
}

export interface OutboxInput {
  type: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  availableAt?: Timestamp;
}

export interface OutboxRow extends Required<OutboxInput> {
  id: number;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: Timestamp;
}

export interface AuditInput {
  actorId: Id | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  requestId?: string | null;
  /** Only for backfills and seeds. */
  createdAt?: Timestamp;
}

export interface AuditRow extends AuditInput {
  id: number;
  createdAt: Timestamp;
}

export interface NotificationRow {
  id: Id;
  userId: Id | null;
  donationId: Id | null;
  channel: 'push' | 'sms' | 'whatsapp' | 'email' | 'in_app';
  template: string;
  locale: Locale;
  payload: Record<string, unknown>;
  sentAt: Timestamp | null;
  readAt: Timestamp | null;
  createdAt: Timestamp;
}

/** What is held for a case, per currency (from the case_fund_summary view). */
export interface CaseFundSummary {
  caseId: Id;
  currency: Currency;
  raisedMinor: number;
  refundedMinor: number;
  disbursedMinor: number;
  heldMinor: number;
}
