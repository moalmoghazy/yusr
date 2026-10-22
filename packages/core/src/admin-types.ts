/** Contract types for the operations dashboard (API ↔ admin app). */
import type { Direction } from './ledger';
import type { Permission } from './rbac';
import type { CaseCategory, CaseDetail, CaseStatus, Currency, DocumentKind, DonationReceipt, Localized, PayeeType, PaymentMethod, Role } from './types';

export interface StatusChange {
  from: CaseStatus | null;
  to: CaseStatus;
  at: string;
  actorName: string;
  reason: string | null;
}

/**
 * Who submits a case. Cases now come from partner associations (جمعيات أهلية registered with the
 * Ministry of Social Solidarity); submissions by individuals (self / family / volunteer) are paused
 * on the website but still understood everywhere.
 */
export const SUBMITTER_RELATIONS = ['association', 'self', 'family', 'volunteer'] as const;
export type SubmitterRelation = (typeof SUBMITTER_RELATIONS)[number];

/** The partner association behind a case (when submitterRelation is `association`). */
export interface PartnerAssociation {
  name: string;
  /** رقم الإشهار: its registration number with the Ministry of Social Solidarity. */
  registrationNumber: string;
  contactName: string;
  /** E.164, e.g. +201001234567. */
  contactPhone: string;
}

export interface AdminCase extends CaseDetail {
  submittedBy: { name: string; relation: SubmitterRelation; association: PartnerAssociation | null };
  auditor: { id: string; name: string } | null;
  history: StatusChange[];
  updatedAt: string;
}

/** What a field auditor confirms on a home visit, in the order the app shows it. */
export const CHECKLIST_ITEMS = ['identity', 'residence', 'documents', 'cost', 'alternatives'] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

export interface VerificationTask {
  id: string;
  caseId: string;
  auditorId: string;
  auditorName: string;
  /** `cancelled` when the case left verification (rejected or reassigned); lists leave those out. */
  status: 'assigned' | 'scheduled' | 'completed' | 'cancelled';
  visitAt: string | null;
  checklist: Record<ChecklistItem, boolean>;
  recommendedMinor: number | null;
  notes: string | null;
}

export type LedgerKind = 'donation' | 'refund' | 'payout' | 'settlement' | 'platform_fee';

export interface LedgerLine {
  id: string;
  transactionId: string;
  kind: LedgerKind;
  at: string;
  account: string;
  direction: Direction;
  amountMinor: number;
  currency: Currency;
  memo: string;
  /** Receipt number, payout reference… */
  reference: string;
}

export interface AdminDonation extends DonationReceipt {
  donorName: string | null;
  donorContact: string | null;
  caseReference: string;
  channel: 'web' | 'mobile';
}

export type PayoutStatus = 'requested' | 'approved' | 'paid' | 'rejected';

export interface Payout {
  id: string;
  reference: string;
  /** Disbursement-plan line this payout settles. */
  lineId: string;
  caseId: string;
  caseReference: string;
  caseTitle: Localized;
  payeeType: PayeeType;
  payee: Localized;
  purpose: Localized;
  amountMinor: number;
  currency: Currency;
  status: PayoutStatus;
  requestedBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  createdAt: string;
  paidAt: string | null;
}

export type RefundStatus = 'requested' | 'approved' | 'processed' | 'rejected';

export interface Refund {
  id: string;
  donationId: string;
  receiptNumber: string;
  amountMinor: number;
  currency: Currency;
  reason: string;
  status: RefundStatus;
  requestedBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  createdAt: string;
}

export type AuditEntity = 'case' | 'donation' | 'payout' | 'refund' | 'user' | 'verification';

export interface AuditEntry {
  id: string;
  at: string;
  actor: { id: string; name: string; role: Role | 'system' };
  action: string;
  entityType: AuditEntity;
  entityId: string;
  entityLabel: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export type DonorSegment = 'major' | 'recurring' | 'new' | 'lapsed';

export interface DonorRow {
  id: string;
  name: Localized;
  region: string;
  totalMinor: number;
  donationsCount: number;
  lastDonationAt: string;
  segment: DonorSegment;
  contactMasked: string;
}

export interface VolunteerRow {
  id: string;
  name: Localized;
  region: string;
  casesSubmitted: number;
  visitsDone: number;
  status: 'active' | 'onboarding' | 'paused';
  contactMasked: string;
  joinedAt: string;
}

export interface TeamMember {
  id: string;
  name: Localized;
  email: string;
  roles: Role[];
  mfa: boolean;
  lastActiveAt: string;
}

export interface SeriesPoint {
  date: string;
  amountMinor: number;
  count: number;
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'donation' | 'case' | 'payout' | 'refund' | 'verification';
  actorName: Localized | null;
  caseTitle: Localized | null;
  amountMinor: number | null;
  currency: Currency | null;
  status: CaseStatus | null;
}

export interface AdminOverview {
  kpis: {
    donationsTodayMinor: number;
    donationsTodayCount: number;
    donationsMonthMinor: number;
    activeCases: number;
    pendingReview: number;
    awaitingTransfers: number;
    medianHoursToFund: number;
    feesMonthMinor: number;
    refundsOpen: number;
  };
  series: SeriesPoint[];
  byMethod: Array<{ method: PaymentMethod; amountMinor: number; count: number }>;
  byCategory: Array<{ category: CaseCategory; amountMinor: number }>;
  activity: ActivityItem[];
}

export interface DonorNotification {
  id: string;
  at: string;
  kind: 'receipt' | 'funded' | 'disbursed';
  caseTitle: Localized;
  caseSlug: string;
  amountMinor: number | null;
  currency: Currency | null;
  payee: Localized | null;
  receiptNumber: string | null;
  read: boolean;
}

export interface LiveDonation {
  id: string;
  at: string;
  displayName: Localized | null;
  amountMinor: number;
  currency: Currency;
  caseSlug: string;
  caseTitle: Localized;
  region: string;
}

/** Text typed in one language; moderators add the other before the case is published. */
export interface SubmittedText {
  ar?: string;
  en?: string;
}

/**
 * The submission portal's request (POST /cases). Documents are uploaded first, straight
 * to private storage, with a ticket from POST /uploads; the case then refers to them by
 * key and SHA-256 so the server can match what was reviewed with what was stored.
 */
export interface SubmitCaseRequest {
  category: CaseCategory;
  submitterRelation: SubmitterRelation;
  /** Required when submitterRelation is `association`. */
  association?: PartnerAssociation | null;
  title: SubmittedText;
  story: SubmittedText;
  region: string;
  city?: string;
  currency: Currency;
  goalMinor: number;
  isUrgent: boolean;
  deadline: string | null;
  beneficiary: {
    /** Shown publicly instead of the real name, e.g. «أم أحمد». */
    pseudonym?: SubmittedText | null;
    /** Stored encrypted; a keyed hash flags repeat submissions for the same person. */
    nationalId?: string | null;
    phone?: string | null;
    householdSize?: number | null;
  };
  documents: Array<{ kind: DocumentKind; storageKey: string; sha256: string }>;
  consent: true;
}

export interface SubmitCaseResult {
  id: string;
  reference: string;
  status: CaseStatus;
  /** Another open case exists for the same national ID; reviewers see it first. */
  possibleDuplicate: boolean;
}

/** A 10-minute presigned upload into the private bucket (POST /uploads). */
export interface UploadTicket {
  key: string;
  url: string;
  /** Send these headers with the PUT. */
  headers: Record<string, string>;
  expiresAt: string;
}

export type { Permission };
