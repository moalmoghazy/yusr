/**
 * Drizzle mirror of migrations/0000_init.sql for typed queries. The SQL file is the
 * source of truth (it holds the triggers and ledger invariants Drizzle cannot express);
 * test/schema.test.ts checks that every table and column here exists there.
 */
import {
  CASE_CATEGORIES,
  CASE_STATUSES,
  CURRENCIES,
  DOCUMENT_KINDS,
  DONATION_STATUSES,
  DONATION_TYPES,
  PAYEE_TYPES,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  ROLES,
  type CheckoutAction,
  type FollowupKind,
  type FollowupOutcome,
  type Localized,
  type PartnerAssociation,
  type PartnerApplicationStatus,
  type PartnerStatus,
  type SubmitterRelation,
} from '@yusr/core';
import type { ContactChannel } from '@yusr/core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ChecklistKey, GuestContact } from './rows';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const inet = customType<{ data: string }>({ dataType: () => 'inet' });
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

const money = (name: string) => bigint(name, { mode: 'number' });
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => at('created_at').notNull().defaultNow();

// ------------------------------------------------------------------ enums
export const userRole = pgEnum('user_role', ROLES);
export const authProvider = pgEnum('auth_provider', ['phone', 'google', 'apple', 'email']);
export const caseCategory = pgEnum('case_category', CASE_CATEGORIES);
export const caseStatus = pgEnum('case_status', CASE_STATUSES);
export const currency = pgEnum('currency', CURRENCIES);
export const documentKind = pgEnum('document_kind', DOCUMENT_KINDS);
export const verificationStatus = pgEnum('verification_status', ['assigned', 'scheduled', 'completed', 'cancelled']);
export const payeeType = pgEnum('payee_type', PAYEE_TYPES);
export const donationType = pgEnum('donation_type', DONATION_TYPES);
export const donationStatus = pgEnum('donation_status', DONATION_STATUSES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentProvider = pgEnum('payment_provider', PAYMENT_PROVIDERS);
export const payoutStatus = pgEnum('payout_status', ['requested', 'approved', 'paid', 'rejected']);
export const refundStatus = pgEnum('refund_status', ['requested', 'approved', 'sending', 'processed', 'rejected']);
export const accountType = pgEnum('account_type', ['asset', 'liability', 'equity', 'revenue', 'expense']);
export const entryKind = pgEnum('entry_kind', ['donation', 'refund', 'payout', 'settlement', 'adjustment', 'platform_fee']);
export const outboxStatus = pgEnum('outbox_status', ['pending', 'processing', 'sent', 'failed']);

// ------------------------------------------------------------------ identity
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').unique(),
  email: citext('email').unique(),
  displayName: text('display_name').notNull(),
  locale: text('locale').$type<'ar' | 'en'>().notNull().default('ar'),
  roles: userRole('roles')
    .array()
    .notNull()
    .default(sql`'{donor}'`),
  region: text('region'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  totpSecretCipher: bytea('totp_secret_cipher'),
  /** 30-second step of the last accepted authenticator code (0005_staff_mfa_guards.sql): no reuse. */
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  /** Until when an administrator lets this person enroll an authenticator (0005_staff_mfa_guards.sql). */
  mfaEnrollmentExpiresAt: at('mfa_enrollment_expires_at'),
  marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
  status: text('status').$type<'active' | 'suspended' | 'deleted'>().notNull().default('active'),
  createdAt: created(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProvider('provider').notNull(),
    subject: text('subject').notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex('auth_identities_subject').on(t.provider, t.subject)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    mfa: boolean('mfa').notNull().default(false),
    replacedBy: uuid('replaced_by'),
    revokedAt: at('revoked_at'),
    expiresAt: at('expires_at').notNull(),
    userAgent: text('user_agent'),
    createdAt: created(),
  },
  (t) => [index('refresh_tokens_family_idx').on(t.familyId)],
);

export const volunteerProfiles = pgTable('volunteer_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').$type<'onboarding' | 'active' | 'paused'>().notNull().default('onboarding'),
  region: text('region').notNull(),
  skills: text('skills')
    .array()
    .notNull()
    .default(sql`'{}'`),
  baserowRowId: integer('baserow_row_id').unique(),
  joinedAt: at('joined_at').notNull().defaultNow(),
});

// ------------------------------------------------------------------ cases
/** The approved-partner registry (0006_partner_registry.sql): associations Yusr signed a contract with. */
export const partners = pgTable('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** رقم الإشهار, normalized (ASCII digits, no spaces). */
  registrationNumber: text('registration_number').notNull().unique(),
  region: text('region').notNull(),
  contractSignedOn: date('contract_signed_on', { mode: 'string' }).notNull(),
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  status: text('status').$type<PartnerStatus>().notNull().default('active'),
  suspendedAt: at('suspended_at'),
  /** HMAC of «كود يُسر»: compared in constant time, unique. */
  codeHash: text('code_hash').notNull().unique(),
  /** «كود يُسر», AES-256-GCM, so staff can read it again to hand it over. */
  codeCipher: bytea('code_cipher').notNull(),
  codeIssuedAt: at('code_issued_at').notNull().defaultNow(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: created(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

/** Join requests from associations (0009_partner_applications.sql). */
export const partnerApplications = pgTable(
  'partner_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    registrationNumber: text('registration_number').notNull(),
    region: text('region').notNull(),
    contactName: text('contact_name').notNull(),
    contactPhone: text('contact_phone').notNull(),
    contactEmail: text('contact_email'),
    message: text('message'),
    status: text('status').$type<PartnerApplicationStatus>().notNull().default('new'),
    handledBy: uuid('handled_by').references(() => users.id),
    handledAt: at('handled_at'),
    createdAt: created(),
  },
  (t) => [index('partner_applications_inbox_idx').on(t.createdAt)],
);

export const beneficiaries = pgTable('beneficiaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  pseudonym: jsonb('pseudonym').$type<Localized>().notNull(),
  nationalIdHash: text('national_id_hash').unique(),
  nationalIdCipher: bytea('national_id_cipher'),
  phoneCipher: bytea('phone_cipher'),
  region: text('region').notNull(),
  householdSize: smallint('household_size'),
  createdAt: created(),
});

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference')
      .notNull()
      .unique()
      .default(sql`('YSR-' || nextval('case_reference_seq'))`),
    slug: text('slug').notNull().unique(),
    category: caseCategory('category').notNull(),
    status: caseStatus('status').notNull().default('draft'),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaries.id),
    /** Null when a partner submitted with its «كود يُسر» and no account (0006). */
    submittedBy: uuid('submitted_by').references(() => users.id),
    submitterRelation: text('submitter_relation').$type<SubmitterRelation>().notNull(),
    /** The partner association that submitted the case (0002_partner_association.sql); null for individuals. */
    association: jsonb('association').$type<PartnerAssociation>(),
    /** The registry entry behind an association case (0006); its name and number fill `association`. */
    partnerId: uuid('partner_id').references(() => partners.id),
    title: jsonb('title').$type<Localized>().notNull(),
    summary: jsonb('summary').$type<Localized>().notNull(),
    /** «نص المشاركة»: the case's own line for social sharing (0001_case_share_text.sql); null = composed. */
    shareText: jsonb('share_text').$type<Localized>(),
    story: jsonb('story').$type<Localized>().notNull(),
    region: text('region').notNull(),
    currency: currency('currency').notNull().default('EGP'),
    goalMinor: money('goal_minor').notNull(),
    /** Yusr's 10% inside the goal (0003_platform_fee.sql); the plan adds up to goal − fee. */
    platformFeeMinor: money('platform_fee_minor').notNull().default(0),
    raisedMinor: money('raised_minor').notNull().default(0),
    donorsCount: integer('donors_count').notNull().default(0),
    isUrgent: boolean('is_urgent').notNull().default(false),
    deadline: at('deadline'),
    zakatEligible: boolean('zakat_eligible').notNull().default(false),
    priority: smallint('priority').notNull().default(0),
    /** The home page's «يحدث الآن» card (0008_case_featured.sql). */
    featuredAt: at('featured_at'),
    coverSeed: integer('cover_seed').notNull().default(0),
    auditorId: uuid('auditor_id').references(() => users.id),
    verifiedAt: at('verified_at'),
    publishedAt: at('published_at'),
    fundedAt: at('funded_at'),
    closedAt: at('closed_at'),
    createdAt: created(),
    updatedAt: at('updated_at').notNull().defaultNow(),
    progressPercent: smallint('progress_percent').generatedAlwaysAs(sql`yusr_progress_percent(raised_minor, goal_minor)`),
    searchText: text('search_text').generatedAlwaysAs(
      sql`yusr_normalize(coalesce(title ->> 'ar', '') || ' ' || coalesce(title ->> 'en', '') || ' ' || coalesce(summary ->> 'ar', '') || ' ' || coalesce(summary ->> 'en', '') || ' ' || reference)`,
    ),
  },
  (t) => [
    index('cases_catalog_idx').on(t.status, t.category, t.region, t.priority),
    index('cases_partner_idx').on(t.partnerId),
    index('cases_featured_idx').on(t.featuredAt),
  ],
);

export const caseDocuments = pgTable(
  'case_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    kind: documentKind('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    redactedKey: text('redacted_key'),
    sha256: text('sha256').notNull(),
    pages: smallint('pages').notNull().default(1),
    /** Null when a partner uploaded with its «كود يُسر» and no account (0006). */
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    redactedBy: uuid('redacted_by').references(() => users.id),
    createdAt: created(),
  },
  (t) => [index('case_documents_case_idx').on(t.caseId)],
);

/** Follow-up calls and visits on funded and closed cases (0010_case_followups.sql); append-only. */
export const caseFollowups = pgTable(
  'case_followups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id),
    kind: text('kind').$type<FollowupKind>().notNull(),
    outcome: text('outcome').$type<FollowupOutcome>().notNull(),
    note: text('note').notNull(),
    nextDueOn: date('next_due_on', { mode: 'string' }),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id),
    recordedAt: at('recorded_at').notNull().defaultNow(),
  },
  (t) => [index('case_followups_case_idx').on(t.caseId, t.recordedAt)],
);

export const caseUpdates = pgTable('case_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  body: jsonb('body').$type<Localized>().notNull(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  createdAt: created(),
});

export const caseStatusRules = pgTable(
  'case_status_rules',
  {
    fromStatus: caseStatus('from_status').notNull(),
    toStatus: caseStatus('to_status').notNull(),
    systemOnly: boolean('system_only').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.fromStatus, t.toStatus] })],
);

export const caseTransitions = pgTable(
  'case_transitions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    fromStatus: caseStatus('from_status').notNull(),
    toStatus: caseStatus('to_status').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    reason: text('reason'),
    createdAt: created(),
  },
  (t) => [index('case_transitions_case_idx').on(t.caseId, t.createdAt)],
);

export const verificationTasks = pgTable('verification_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  auditorId: uuid('auditor_id')
    .notNull()
    .references(() => users.id),
  assignedBy: uuid('assigned_by')
    .notNull()
    .references(() => users.id),
  status: verificationStatus('status').notNull().default('assigned'),
  visitAt: at('visit_at'),
  checklist: jsonb('checklist').$type<Record<ChecklistKey, boolean>>().notNull(),
  recommendedMinor: money('recommended_minor'),
  notes: text('notes'),
  baserowRowId: integer('baserow_row_id'),
  completedAt: at('completed_at'),
  createdAt: created(),
});

export const disbursementLines = pgTable(
  'disbursement_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    payeeType: payeeType('payee_type').notNull(),
    payee: jsonb('payee').$type<Localized>().notNull(),
    purpose: jsonb('purpose').$type<Localized>().notNull(),
    amountMinor: money('amount_minor').notNull(),
    payeeAccountMasked: text('payee_account_masked'),
    position: smallint('position').notNull().default(0),
  },
  (t) => [index('disbursement_lines_case_idx').on(t.caseId, t.position)],
);

// ------------------------------------------------------------------ donations & payments
export const donations = pgTable(
  'donations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id),
    donorId: uuid('donor_id').references(() => users.id),
    /** The receipt contact: a guest's, or the number/address a donor chose for messages (0007). */
    guestContact: jsonb('guest_contact').$type<GuestContact>(),
    /** «طريقة التواصل المفضلة» (0007); null for gifts made before it was asked. */
    contactChannel: text('contact_channel').$type<ContactChannel>(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    requestHash: text('request_hash').notNull(),
    type: donationType('type').notNull().default('sadaqah'),
    anonymous: boolean('anonymous').notNull().default(false),
    dedication: text('dedication'),
    currency: currency('currency').notNull(),
    amountMinor: money('amount_minor').notNull(),
    coverFees: boolean('cover_fees').notNull().default(false),
    estimatedFeeMinor: money('estimated_fee_minor').notNull(),
    feeMinor: money('fee_minor'),
    chargedMinor: money('charged_minor').notNull(),
    caseCurrency: currency('case_currency').notNull(),
    fxRate: numeric('fx_rate', { precision: 18, scale: 8 }).notNull().default('1'),
    netToCaseMinor: money('net_to_case_minor').notNull(),
    method: paymentMethod('method').notNull(),
    provider: paymentProvider('provider').notNull(),
    status: donationStatus('status').notNull().default('pending'),
    receiptNo: text('receipt_no').notNull().unique(),
    receiptTokenHash: text('receipt_token_hash').notNull(),
    locale: text('locale').$type<'ar' | 'en'>().notNull().default('ar'),
    channel: text('channel').$type<'web' | 'mobile' | 'admin'>().notNull().default('web'),
    expiresAt: at('expires_at').notNull(),
    succeededAt: at('succeeded_at'),
    createdAt: created(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (t) => [index('donations_case_idx').on(t.caseId, t.status, t.succeededAt), index('donations_donor_idx').on(t.donorId, t.createdAt)],
);

export const receiptCounters = pgTable('receipt_counters', {
  year: smallint('year').primaryKey(),
  lastValue: integer('last_value').notNull().default(0),
});

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donationId: uuid('donation_id')
      .notNull()
      .references(() => donations.id),
    provider: paymentProvider('provider').notNull(),
    providerRef: text('provider_ref'),
    /** The provider's order for this checkout (Paymob), which its callbacks are matched by. */
    providerOrderRef: text('provider_order_ref'),
    status: text('status').$type<'created' | 'action_required' | 'captured' | 'failed' | 'refunded'>().notNull(),
    amountMinor: money('amount_minor').notNull(),
    currency: currency('currency').notNull(),
    action: jsonb('action').$type<CheckoutAction>(),
    failureCode: text('failure_code'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('payment_attempts_ref').on(t.provider, t.providerRef),
    uniqueIndex('payment_attempts_order_ref')
      .on(t.provider, t.providerOrderRef)
      .where(sql`provider_order_ref IS NOT NULL`),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: paymentProvider('provider').notNull(),
    eventId: text('event_id').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: at('received_at').notNull().defaultNow(),
    processedAt: at('processed_at'),
    error: text('error'),
  },
  (t) => [uniqueIndex('webhook_events_once').on(t.provider, t.eventId)],
);

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id),
  lineId: uuid('line_id')
    .notNull()
    .references(() => disbursementLines.id),
  amountMinor: money('amount_minor').notNull(),
  currency: currency('currency').notNull(),
  payeeAccountMasked: text('payee_account_masked').notNull(),
  status: payoutStatus('status').notNull().default('requested'),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: at('approved_at'),
  paidAt: at('paid_at'),
  /** Who recorded the bank transfer; never the officer who requested the payout. */
  paidBy: uuid('paid_by').references(() => users.id),
  bankReference: text('bank_reference'),
  proofDocumentId: uuid('proof_document_id').references(() => caseDocuments.id),
  createdAt: created(),
});

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  donationId: uuid('donation_id')
    .notNull()
    .references(() => donations.id),
  amountMinor: money('amount_minor').notNull(),
  reason: text('reason').notNull(),
  status: refundStatus('status').notNull().default('requested'),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  providerRef: text('provider_ref'),
  processedAt: at('processed_at'),
  createdAt: created(),
});

// ------------------------------------------------------------------ ledger
export const ledgerAccounts = pgTable('ledger_accounts', {
  code: text('code').primaryKey(),
  type: accountType('type').notNull(),
  currency: currency('currency'),
  caseId: uuid('case_id').references(() => cases.id),
  createdAt: created(),
});

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: entryKind('kind').notNull(),
  memo: text('memo'),
  donationId: uuid('donation_id').references(() => donations.id),
  payoutId: uuid('payout_id').references(() => payouts.id),
  refundId: uuid('refund_id').references(() => refunds.id),
  postedBy: uuid('posted_by').references(() => users.id),
  postedAt: at('posted_at').notNull().defaultNow(),
});

export const journalLines = pgTable(
  'journal_lines',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id),
    accountCode: text('account_code')
      .notNull()
      .references(() => ledgerAccounts.code),
    direction: text('direction').$type<'debit' | 'credit'>().notNull(),
    amountMinor: money('amount_minor').notNull(),
    currency: currency('currency').notNull(),
    memo: text('memo'),
  },
  (t) => [index('journal_lines_entry_idx').on(t.entryId), index('journal_lines_account_idx').on(t.accountCode, t.currency)],
);

// ------------------------------------------------------------------ platform
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid('actor_id').references(() => users.id),
    actorRole: userRole('actor_role'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    ip: inet('ip'),
    requestId: text('request_id'),
    createdAt: created(),
  },
  (t) => [index('audit_logs_entity_idx').on(t.entityType, t.entityId, t.createdAt)],
);

export const outboxEvents = pgTable('outbox_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  type: text('type').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: outboxStatus('status').notNull().default('pending'),
  attempts: smallint('attempts').notNull().default(0),
  availableAt: at('available_at').notNull().defaultNow(),
  lastError: text('last_error'),
  createdAt: created(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  donationId: uuid('donation_id').references(() => donations.id),
  channel: text('channel').$type<'push' | 'sms' | 'whatsapp' | 'email' | 'in_app'>().notNull(),
  template: text('template').notNull(),
  locale: text('locale').$type<'ar' | 'en'>().notNull().default('ar'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  sentAt: at('sent_at'),
  readAt: at('read_at'),
  createdAt: created(),
});

export const schema = {
  users,
  authIdentities,
  refreshTokens,
  volunteerProfiles,
  partners,
  beneficiaries,
  cases,
  caseDocuments,
  caseUpdates,
  caseStatusRules,
  caseTransitions,
  verificationTasks,
  disbursementLines,
  donations,
  receiptCounters,
  paymentAttempts,
  webhookEvents,
  payouts,
  refunds,
  ledgerAccounts,
  journalEntries,
  journalLines,
  auditLogs,
  outboxEvents,
  notifications,
};
