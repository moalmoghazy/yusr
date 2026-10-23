/**
 * Runtime validation (zod v4) shared by the API (request pipes) and the web/mobile forms,
 * so a rule is written once and enforced identically on both sides.
 */
import { z } from 'zod';
import { CHECKLIST_ITEMS, SUBMITTER_RELATIONS } from './admin-types';
import { DEDICATION_MAX_LENGTH } from './donation';
import { isYusrCode, normalizeRegistrationNumber, normalizeYusrCode, PARTNER_STATUSES } from './partners';
import {
  CASE_CATEGORIES,
  CASE_STATUSES,
  CURRENCIES,
  DOCUMENT_KINDS,
  DONATION_STATUSES,
  DONATION_TYPES,
  LOCALES,
  PAYEE_TYPES,
  PAYMENT_METHODS,
  ROLES,
} from './types';

/** E.164 phone numbers, e.g. +201001234567 or +966501234567. */
export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +201001234567');

/** A record id (UUID), e.g. one posted back by a form before it goes into an API path. */
export const idSchema = z.uuid();

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess((value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value), z.array(item).max(30));

const booleanish = z.preprocess((value) => value === true || value === 'true' || value === '1', z.boolean());

export const localeSchema = z.enum(LOCALES);
export const currencySchema = z.enum(CURRENCIES);

export const createDonationSchema = z.object({
  caseId: z.uuid(),
  amountMinor: z.number().int().positive().max(1_000_000_000),
  currency: currencySchema,
  method: z.enum(PAYMENT_METHODS),
  coverFees: z.boolean().default(false),
  anonymous: z.boolean().default(false),
  type: z.enum(DONATION_TYPES).default('sadaqah'),
  dedication: z.string().trim().max(DEDICATION_MAX_LENGTH).nullish(),
  donor: z
    .object({
      name: z.string().trim().min(2).max(80).nullish(),
      email: z.email().max(254).nullish(),
      phone: phoneSchema.nullish(),
    })
    .nullish(),
  locale: localeSchema.default('ar'),
  returnUrl: z.url().nullish(),
});
export type CreateDonationInput = z.infer<typeof createDonationSchema>;

export const caseFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categories: csv(z.enum(CASE_CATEGORIES)).optional(),
  regions: csv(z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)).optional(),
  urgentOnly: booleanish.optional(),
  zakatOnly: booleanish.optional(),
  includeFunded: booleanish.optional(),
  minProgress: z.coerce.number().int().min(0).max(100).optional(),
  maxProgress: z.coerce.number().int().min(0).max(100).optional(),
  sort: z.enum(['urgent', 'closest', 'newest', 'least_funded']).default('urgent'),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  cursor: z.string().max(200).nullish(),
});
export type CaseFiltersInput = z.infer<typeof caseFiltersSchema>;

export const transitionCaseSchema = z.object({
  to: z.enum(CASE_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export const prioritizeCaseSchema = z.object({
  priority: z.number().int().min(0).max(100),
});

/** Text in either language; moderators add the other one before publishing. */
const submittedText = (min: number, max: number) =>
  z
    .object({ ar: z.string().trim().max(max).optional(), en: z.string().trim().max(max).optional() })
    .refine((text) => (text.ar?.length ?? 0) >= min || (text.en?.length ?? 0) >= min, { message: `Write at least ${min} characters` });

const localized = (max: number) => z.object({ ar: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) });

const regionSchema = z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/);

// ------------------------------------------------------------------ approved partners («كود يُسر»)
/** رقم الإشهار, normalized (ASCII digits, no spaces) before it is checked or stored. */
export const registrationNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform(normalizeRegistrationNumber)
  .pipe(z.string().regex(/^[0-9A-Z/-]{1,40}$/, 'Use digits, letters, / or -'));

/** «كود يُسر», normalized from what people type (spaces, lower case, missing prefix, Arabic-Indic digits). */
export const yusrCodeSchema = z.string().trim().min(4).max(40).transform(normalizeYusrCode).refine(isYusrCode, 'Enter the Yusr code, e.g. YSR-7K2M9QXA');

export const partnerCredentialsSchema = z.object({ registrationNumber: registrationNumberSchema, yusrCode: yusrCodeSchema });

/** A YYYY-MM-DD calendar day (a contract's signing date). */
const calendarDay = z.iso.date();

export const createPartnerSchema = z.object({
  name: z.string().trim().min(3).max(120),
  registrationNumber: registrationNumberSchema,
  region: regionSchema,
  contractSignedOn: calendarDay,
  contactName: z.string().trim().min(2).max(80),
  contactPhone: phoneSchema,
});
export type CreatePartnerInput = z.infer<typeof createPartnerSchema>;

export const updatePartnerSchema = createPartnerSchema.partial().refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;

export const partnerStatusSchema = z.object({
  status: z.enum(PARTNER_STATUSES),
  reason: z.string().trim().max(500).nullish(),
});

export const submitCaseSchema = z
  .object({
    category: z.enum(CASE_CATEGORIES),
    submitterRelation: z.enum(SUBMITTER_RELATIONS),
    /** The association's رقم الإشهار and «كود يُسر» (checked against the registry) and this case's contact person. */
    association: partnerCredentialsSchema
      .extend({
        contactName: z.string().trim().min(2).max(80),
        contactPhone: phoneSchema,
      })
      .nullish(),
    title: submittedText(8, 120),
    story: submittedText(80, 6000),
    region: regionSchema,
    city: z.string().trim().max(80).optional(),
    currency: currencySchema.default('EGP'),
    goalMinor: z.number().int().min(1_000_00).max(10_000_000_00),
    isUrgent: z.boolean().default(false),
    deadline: z.iso.datetime().nullish(),
    beneficiary: z
      .object({
        pseudonym: submittedText(2, 60).nullish(),
        // Egyptian national IDs have 14 digits, Saudi IDs and iqamas 10.
        nationalId: z
          .string()
          .trim()
          .regex(/^(\d{14}|\d{10})$/, 'National ID is 14 digits (Egypt) or 10 digits (Saudi Arabia)')
          .nullish(),
        phone: phoneSchema.nullish(),
        householdSize: z.number().int().min(1).max(30).nullish(),
      })
      .default({}),
    documents: z
      .array(
        z.object({
          kind: z.enum(DOCUMENT_KINDS),
          storageKey: z.string().min(8).max(300),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .min(1)
      .max(20),
    consent: z.literal(true),
  })
  .refine((input) => input.submitterRelation !== 'association' || Boolean(input.association), {
    message: 'A partner association’s submission needs its details',
    path: ['association'],
  });
export type SubmitCaseInput = z.infer<typeof submitCaseSchema>;

/** Moderator edits before or after publishing (wording, flags, deadline). */
export const editCaseSchema = z
  .object({
    title: localized(120).optional(),
    summary: localized(240).optional(),
    /** «نص المشاركة»; null clears it (the share line is then composed). */
    shareText: localized(220).nullable().optional(),
    story: localized(6000).optional(),
    zakatEligible: z.boolean().optional(),
    isUrgent: z.boolean().optional(),
    deadline: z.iso.datetime().nullish(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });
export type EditCaseInput = z.input<typeof editCaseSchema>;

/** The disbursement plan: who is paid, for what, how much. Fixed once the case is published. */
export const disbursementPlanSchema = z.object({
  lines: z
    .array(
      z.object({
        payeeType: z.enum(PAYEE_TYPES),
        payee: localized(120),
        purpose: localized(300),
        amountMinor: z.number().int().positive(),
        payeeAccount: z.string().trim().min(6).max(64).nullish(),
      }),
    )
    .min(1)
    .max(12),
});

export const presignUploadSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  /** A partner association uploading without an account: its رقم الإشهار and «كود يُسر». */
  association: partnerCredentialsSchema.nullish(),
});

const sixDigits = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const otpRequestSchema = z.object({ phone: phoneSchema, locale: localeSchema.default('ar') });
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: sixDigits,
  /** Staff: the authenticator-app code, for a session that can use staff permissions. */
  totp: sixDigits.nullish(),
  name: z.string().trim().min(2).max(80).nullish(),
  locale: localeSchema.optional(),
});
export const oauthSchema = z.object({
  idToken: z.string().min(20).max(8000),
  nonce: z.string().max(200).optional(),
  totp: sixDigits.nullish(),
  locale: localeSchema.optional(),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(500) });
export const mfaCodeSchema = z.object({ code: sixDigits });
export const markNotificationsReadSchema = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

export const refundRequestSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().trim().min(5).max(500),
});

export const confirmTransferSchema = z.object({
  bankReference: z.string().trim().min(4).max(64),
  receivedMinor: z.number().int().positive(),
});

/** Maker: request a payout for one line of the case's disbursement plan. */
export const createPayoutSchema = z.object({
  caseId: z.uuid(),
  lineId: z.uuid(),
  /** Part of the line (defaults to what is left of it). */
  amountMinor: z.number().int().positive().optional(),
  // No payee account here: a payout goes to the account on the reviewed plan line.
});

export const markPayoutPaidSchema = z.object({
  bankReference: z.string().trim().min(4).max(64),
  proofDocumentId: z.uuid().nullish(),
});

export const rejectSchema = z.object({ reason: z.string().trim().min(5).max(500) });

export const assignAuditorSchema = z.object({
  auditorId: z.uuid(),
  visitAt: z.iso.datetime().nullish(),
});

export const checklistUpdateSchema = z.object({
  item: z.enum(CHECKLIST_ITEMS),
  checked: z.boolean(),
});

export const completeVerificationSchema = z.object({
  recommendedMinor: z.number().int().min(0).max(10_000_000_00),
  notes: z.string().trim().max(2000).nullish(),
});

export const updateRolesSchema = z.object({ roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length) });

export const presignRedactedSchema = presignUploadSchema.omit({ kind: true, association: true });
export const confirmRedactedSchema = z.object({ key: z.string().min(8).max(300) });

export const quoteDonationSchema = createDonationSchema.pick({ caseId: true, amountMinor: true, currency: true, method: true, coverFees: true });

// ------------------------------------------------------------------ query strings
const limit = (max: number, fallback: number) => z.coerce.number().int().min(1).max(max).default(fallback);

export const liveQuerySchema = z.object({ limit: limit(50, 12) });
export const listQuerySchema = z.object({ limit: limit(100, 50) });
export const adminCasesQuerySchema = z.object({ status: z.enum(CASE_STATUSES).optional(), q: z.string().trim().max(100).optional() });
export const ledgerQuerySchema = z.object({
  limit: limit(1_000, 200),
  kind: z.enum(['donation', 'refund', 'payout', 'settlement', 'platform_fee']).optional(),
  account: z.string().trim().max(120).optional(),
});
export const adminDonationsQuerySchema = z.object({ status: z.enum(DONATION_STATUSES).optional() });
export const auditQuerySchema = z.object({ limit: limit(500, 100) });
