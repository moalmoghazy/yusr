/**
 * Shared domain vocabulary and API contract types.
 * These are the shapes the API returns and the web / admin / mobile apps consume.
 */

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
/** A string (or any value) available in every supported locale. */
export type Localized<T = string> = Record<Locale, T>;

export const CURRENCIES = ['EGP', 'SAR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CASE_CATEGORIES = ['medical', 'debt_relief', 'education', 'orphans', 'relief'] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

/**
 * Case lifecycle. The happy path is
 * draft → under_review → field_verified → published → funded → closed,
 * with paused / rejected as side states (see lifecycle.ts).
 */
export const CASE_STATUSES = ['draft', 'under_review', 'field_verified', 'published', 'funded', 'closed', 'paused', 'rejected'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PAYMENT_METHODS = ['card', 'apple_pay', 'mada', 'vodafone_cash', 'fawry', 'instapay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROVIDERS = ['paymob', 'fawry', 'stripe', 'moyasar', 'instapay'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const DONATION_STATUSES = [
  'pending',
  'requires_action',
  'awaiting_transfer',
  'succeeded',
  'failed',
  'canceled',
  'expired',
  'refunded',
  'partially_refunded',
  'needs_review',
] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

/** Islamic giving intent. Zakat is only accepted on cases marked zakat-eligible. */
export const DONATION_TYPES = ['sadaqah', 'zakat', 'general'] as const;
export type DonationType = (typeof DONATION_TYPES)[number];

export const ROLES = ['donor', 'beneficiary', 'volunteer', 'field_auditor', 'content_moderator', 'financial_officer', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

export const DOCUMENT_KINDS = [
  'national_id',
  'medical_report',
  'price_quote',
  'invoice',
  'debt_proof',
  'court_ruling',
  'school_record',
  'field_report',
  'disbursement_proof',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const PAYEE_TYPES = ['hospital', 'pharmacy', 'creditor', 'school', 'vendor', 'landlord', 'beneficiary'] as const;
export type PayeeType = (typeof PAYEE_TYPES)[number];

export type CaseSort = 'urgent' | 'closest' | 'newest' | 'least_funded';

export interface CaseSummary {
  id: string;
  slug: string;
  /** Human-friendly reference printed on receipts, e.g. YSR-10482. */
  reference: string;
  category: CaseCategory;
  status: CaseStatus;
  title: Localized;
  summary: Localized;
  /**
   * «نص المشاركة»: the case's own line for social sharing, written by the team (who it helps and what
   * the money completes). Null when not written: the share line is then composed from title and category.
   */
  shareText: Localized | null;
  /** ISO 3166-2 subdivision code, e.g. EG-C (Cairo) or SA-01 (Riyadh). */
  region: string;
  currency: Currency;
  goalMinor: number;
  raisedMinor: number;
  donorsCount: number;
  isUrgent: boolean;
  /** ISO timestamp; urgent cases show a live countdown to this moment. */
  deadline: string | null;
  zakatEligible: boolean;
  verifiedAt: string | null;
  publishedAt: string | null;
  fundedAt: string | null;
  /** Higher numbers float to the top of listings (set by moderators). */
  priority: number;
  /** Deterministic seed for the illustrated cover (no beneficiary photos by design). */
  coverSeed: number;
  createdAt: string;
}

export interface CaseDocumentPublic {
  id: string;
  kind: DocumentKind;
  title: Localized;
  pages: number;
  /** Public copies are always redacted; originals can be inspected at the head office and by the audit and review team. */
  redacted: boolean;
  verifiedBy: Localized;
  issuedAt: string;
}

export type TimelineKind =
  'submitted' | 'review_started' | 'visit_scheduled' | 'visit_completed' | 'documents_verified' | 'published' | 'funded' | 'disbursed' | 'closed';

export interface TimelineEvent {
  kind: TimelineKind;
  at: string;
  actor: Localized;
  note?: Localized;
}

export type DisbursementStatus = 'planned' | 'approved' | 'paid';

export interface DisbursementLine {
  id: string;
  payeeType: PayeeType;
  payee: Localized;
  purpose: Localized;
  amountMinor: number;
  status: DisbursementStatus;
  paidAt: string | null;
}

export interface CaseUpdate {
  id: string;
  at: string;
  body: Localized;
}

export interface PublicDonation {
  id: string;
  /** null when the donor chose to stay anonymous. */
  displayName: string | null;
  /** Amount credited to the case, in the case currency. */
  amountMinor: number;
  createdAt: string;
}

export interface CaseDetail extends CaseSummary {
  story: Localized;
  /** Privacy-preserving alias, e.g. "Um Sara, 34". */
  beneficiary: Localized;
  documents: CaseDocumentPublic[];
  timeline: TimelineEvent[];
  disbursements: DisbursementLine[];
  updates: CaseUpdate[];
  recentDonations: PublicDonation[];
}

export interface CaseFilters {
  q?: string;
  categories?: CaseCategory[];
  regions?: string[];
  urgentOnly?: boolean;
  zakatOnly?: boolean;
  /** Inclusive completion range, 0–100. */
  minProgress?: number;
  maxProgress?: number;
  includeFunded?: boolean;
  sort?: CaseSort;
  limit?: number;
  cursor?: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}

export interface DonorContact {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CreateDonationRequest {
  caseId: string;
  /** Amount the donor intends to give, in minor units of `currency`. */
  amountMinor: number;
  currency: Currency;
  method: PaymentMethod;
  /** Donor adds the processing fee so the case receives the full amount. */
  coverFees: boolean;
  anonymous: boolean;
  type: DonationType;
  dedication?: string | null;
  /** Guest checkout contact for the receipt (optional when signed in). */
  donor?: DonorContact | null;
  locale: Locale;
  returnUrl?: string | null;
}

export type CheckoutAction =
  | { type: 'redirect'; provider: PaymentProvider; url: string }
  | { type: 'stripe_client_secret'; clientSecret: string; publishableKey: string }
  | { type: 'fawry_reference'; referenceNumber: string; expiresAt: string }
  | { type: 'bank_transfer'; ipa: string; accountName: string; reference: string; expiresAt: string }
  | { type: 'none' };

export interface DonationBreakdown {
  provider: PaymentProvider;
  currency: Currency;
  /** What the donor intended to give. */
  amountMinor: number;
  /** What the gateway will charge (amount + covered fee). */
  chargedMinor: number;
  estimatedFeeMinor: number;
  donorCoveredFeeMinor: number;
  caseCurrency: Currency;
  /** Amount credited to the case, in the case currency. */
  netToCaseMinor: number;
  /** Units of case currency per 1 unit of donor currency. */
  fxRate: number;
}

export interface CreateDonationResponse {
  donationId: string;
  status: DonationStatus;
  receiptNumber: string;
  /** Opaque token that lets a guest view the receipt without an account. */
  receiptToken: string;
  breakdown: DonationBreakdown;
  action: CheckoutAction;
}

export interface DonationReceipt {
  id: string;
  receiptNumber: string;
  status: DonationStatus;
  caseId: string;
  caseSlug: string;
  caseTitle: Localized;
  type: DonationType;
  anonymous: boolean;
  dedication: string | null;
  method: PaymentMethod;
  provider: PaymentProvider;
  currency: Currency;
  amountMinor: number;
  chargedMinor: number;
  feeMinor: number;
  caseCurrency: Currency;
  netToCaseMinor: number;
  createdAt: string;
  succeededAt: string | null;
}

export interface PlatformStats {
  /** Total raised, expressed in EGP minor units. */
  raisedMinor: number;
  casesFunded: number;
  donors: number;
  regionsCovered: number;
  /** Median hours between publishing and reaching the goal. */
  medianHoursToFund: number;
}

export interface Actor {
  id: string;
  name: string;
  roles: Role[];
}
