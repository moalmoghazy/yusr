import type { EditCaseInput } from '@yusr/core/schemas';
import type {
  AdminCase,
  AdminDonation,
  AdminOverview,
  AuditEntry,
  AuthSession,
  CaseDetail,
  CaseFilters,
  CaseStatus,
  CaseSummary,
  ChecklistItem,
  CreateDonationRequest,
  CreateDonationResponse,
  DonationReceipt,
  DonorNotification,
  DonorRow,
  LedgerLine,
  LiveDonation,
  Locale,
  OtpChallenge,
  Page,
  Payout,
  PlatformStats,
  Refund,
  Role,
  DocumentKind,
  SubmitCaseRequest,
  SignInProvider,
  SubmitCaseResult,
  TeamMember,
  UploadTicket,
  VerificationTask,
  VolunteerRow,
} from '@yusr/core';

/** Public + donor API used by the web and mobile apps. */
export interface YusrClient {
  stats(): Promise<PlatformStats>;
  listCases(filters?: CaseFilters): Promise<Page<CaseSummary>>;
  getCase(slug: string): Promise<CaseDetail | null>;
  liveDonations(limit?: number): Promise<LiveDonation[]>;
  createDonation(request: CreateDonationRequest, options?: { idempotencyKey?: string }): Promise<CreateDonationResponse>;
  getDonation(id: string, receiptToken?: string): Promise<DonationReceipt>;
  myDonations(): Promise<DonationReceipt[]>;
  myNotifications(): Promise<DonorNotification[]>;
  /** Step 1 of a submission: a short-lived upload link per document (PUT the file there, then submit its key). */
  presignUpload(input: { kind: DocumentKind; contentType: string; sizeBytes: number }): Promise<UploadTicket>;
  submitCase(request: SubmitCaseRequest): Promise<SubmitCaseResult>;
}

export interface LedgerQuery {
  limit?: number;
  kind?: LedgerLine['kind'];
  account?: string;
}

/** Operations API used by the admin dashboard. Every call is authorized server-side (RBAC). */
export interface AdminClient {
  overview(): Promise<AdminOverview>;
  cases(filter?: { status?: CaseStatus; q?: string }): Promise<AdminCase[]>;
  transitionCase(caseId: string, to: CaseStatus, reason?: string): Promise<AdminCase>;
  setPriority(caseId: string, priority: number): Promise<AdminCase>;
  /** Edit a case's wording, its share line («نص المشاركة»; null = composed) and flags. */
  editCase(caseId: string, patch: EditCaseInput): Promise<AdminCase>;
  assignAuditor(caseId: string, auditorId: string): Promise<VerificationTask>;
  verificationTasks(): Promise<VerificationTask[]>;
  updateChecklist(taskId: string, item: ChecklistItem, checked: boolean): Promise<VerificationTask>;
  completeVerification(taskId: string, recommendedMinor: number, notes?: string): Promise<AdminCase>;
  ledger(query?: LedgerQuery): Promise<LedgerLine[]>;
  donations(filter?: { status?: AdminDonation['status'] }): Promise<AdminDonation[]>;
  /** InstaPay / bank transfer reconciliation: the amount must match what the donor was asked to send. */
  confirmTransfer(donationId: string, bankReference: string, receivedMinor: number): Promise<AdminDonation>;
  refunds(): Promise<Refund[]>;
  requestRefund(donationId: string, reason: string, amountMinor?: number): Promise<Refund>;
  approveRefund(refundId: string): Promise<Refund>;
  payouts(): Promise<Payout[]>;
  requestPayout(caseId: string, lineId: string): Promise<Payout>;
  approvePayout(payoutId: string): Promise<Payout>;
  markPayoutPaid(payoutId: string, bankReference: string): Promise<Payout>;
  donors(): Promise<DonorRow[]>;
  volunteers(): Promise<VolunteerRow[]>;
  team(): Promise<TeamMember[]>;
  updateRoles(userId: string, roles: Role[]): Promise<TeamMember>;
  audit(limit?: number): Promise<AuditEntry[]>;
}

/** Sign-in and sessions (phone OTP, Google/Apple, rotation, logout). */
export interface AuthClient {
  requestOtp(phone: string, locale?: Locale): Promise<OtpChallenge>;
  /** Staff add `totp` (their authenticator code); without it the session carries mfa=false. */
  verifyOtp(input: { phone: string; code: string; totp?: string | null; name?: string | null; locale?: Locale }): Promise<AuthSession>;
  signInWithProvider(provider: SignInProvider, input: { idToken: string; nonce?: string; totp?: string | null; locale?: Locale }): Promise<AuthSession>;
  /** Each refresh token works once; the response carries its replacement. */
  refresh(refreshToken: string): Promise<AuthSession>;
  logout(refreshToken: string): Promise<void>;
}
