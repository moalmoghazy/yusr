/**
 * The control hub: case pipeline, field verification, documents, finance (maker-checker)
 * and people. Every route needs a staff session; each service call checks the exact
 * permission and the two-factor requirement, and writes the audit log.
 */
import {
  adminCasesQuerySchema,
  adminDonationsQuerySchema,
  assignAuditorSchema,
  auditQuerySchema,
  checklistUpdateSchema,
  completeVerificationSchema,
  confirmRedactedSchema,
  confirmTransferSchema,
  createPayoutSchema,
  disbursementPlanSchema,
  editCaseSchema,
  ledgerQuerySchema,
  markPayoutPaidSchema,
  presignRedactedSchema,
  prioritizeCaseSchema,
  refundRequestSchema,
  rejectSchema,
  transitionCaseSchema,
  updateRolesSchema,
} from '@yusr/core/schemas';
import { endpoint } from '../endpoint';

const CASES = 'Operations · Cases';
const FINANCE = 'Operations · Finance';
const PEOPLE = 'Operations · People';
const toDate = (value: string | null | undefined) => (value === undefined ? undefined : value === null ? null : new Date(value));

export const caseOperations = [
  endpoint({
    id: 'admin.overview',
    method: 'GET',
    path: '/admin/overview',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Dashboard: money in, pipeline counts, 30-day series, payment mix, recent activity',
    permission: 'cases:read',
    returns: 'AdminOverview',
    handle: ({ services, ctx }) => services.admin.overview(ctx),
  }),
  endpoint({
    id: 'admin.cases.list',
    method: 'GET',
    path: '/admin/cases',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Cases in any status, newest first',
    permission: 'cases:read',
    query: adminCasesQuerySchema,
    returns: 'AdminCase[]',
    handle: ({ services, ctx, query }) => services.admin.cases(query, ctx),
  }),
  endpoint({
    id: 'admin.cases.get',
    method: 'GET',
    path: '/admin/cases/:id',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'A case with its history, auditor and every document',
    permission: 'cases:read',
    returns: 'AdminCase',
    handle: ({ services, ctx, params }) => services.cases.adminCase(params['id']!, ctx),
  }),
  endpoint({
    id: 'admin.cases.edit',
    method: 'PATCH',
    path: '/admin/cases/:id',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Edit wording, translations and flags',
    permission: 'cases:edit',
    body: editCaseSchema,
    returns: 'AdminCase',
    handle: async ({ services, ctx, params, body }) => {
      const { deadline, ...rest } = body;
      await services.cases.editContent(params['id']!, { ...rest, ...(deadline !== undefined ? { deadline: toDate(deadline) ?? null } : {}) }, ctx);
      return services.cases.adminCase(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.cases.transition',
    method: 'POST',
    path: '/admin/cases/:id/transitions',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Move a case through the pipeline (draft → under_review → field_verified → published → funded → closed)',
    description:
      'Allowed moves and who may make them come from @yusr/core (CASE_TRANSITIONS). Rejecting or pausing needs a reason. "funded" is reached only by the ledger.',
    permission: 'cases:review',
    body: transitionCaseSchema,
    returns: 'AdminCase',
    handle: async ({ services, ctx, params, body }) => {
      await services.cases.transition(params['id']!, body, ctx);
      return services.cases.adminCase(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.cases.prioritize',
    method: 'PATCH',
    path: '/admin/cases/:id/priority',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Set the priority used to order the catalog (0–100)',
    permission: 'cases:prioritize',
    body: prioritizeCaseSchema,
    returns: 'AdminCase',
    handle: async ({ services, ctx, params, body }) => {
      await services.cases.prioritize(params['id']!, body.priority, ctx);
      return services.cases.adminCase(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.cases.plan',
    method: 'PUT',
    path: '/admin/cases/:id/plan',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Set the disbursement plan: who is paid, for what, how much (fixed once published)',
    permission: 'cases:edit',
    body: disbursementPlanSchema,
    returns: 'AdminCase',
    handle: async ({ services, ctx, params, body }) => {
      await services.cases.setDisbursementPlan(params['id']!, body.lines, ctx);
      return services.cases.adminCase(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.verification.assign',
    method: 'POST',
    path: '/admin/cases/:id/verification',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Assign a field auditor (posts to #field-ops and the Baserow visits board)',
    permission: 'verifications:assign',
    body: assignAuditorSchema,
    status: 201,
    returns: 'VerificationTask',
    handle: async ({ services, ctx, params, body }) => {
      const task = await services.verification.assign(params['id']!, { auditorId: body.auditorId, visitAt: toDate(body.visitAt) ?? null }, ctx);
      return services.admin.toVerificationTask(task);
    },
  }),
  endpoint({
    id: 'admin.verification.list',
    method: 'GET',
    path: '/admin/verification-tasks',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Open and recent field visits (auditors see their own)',
    permission: 'cases:read',
    returns: 'VerificationTask[]',
    handle: ({ services, ctx }) => services.admin.verificationTasks(ctx),
  }),
  endpoint({
    id: 'admin.verification.checklist',
    method: 'PATCH',
    path: '/admin/verification-tasks/:id/checklist',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Tick an item of the visit checklist',
    permission: 'verifications:perform',
    body: checklistUpdateSchema,
    returns: 'VerificationTask',
    handle: async ({ services, ctx, params, body }) => {
      const task = await services.verification.updateChecklist(params['id']!, { [body.item]: body.checked }, ctx);
      return services.admin.toVerificationTask(task);
    },
  }),
  endpoint({
    id: 'admin.verification.complete',
    method: 'POST',
    path: '/admin/verification-tasks/:id/complete',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'File the visit report with the recommended amount (moves the case to field_verified)',
    permission: 'verifications:perform',
    body: completeVerificationSchema,
    returns: 'AdminCase',
    handle: async ({ services, ctx, params, body }) => {
      const task = await services.verification.complete(params['id']!, body, ctx);
      return services.cases.adminCase(task.caseId, ctx);
    },
  }),
  endpoint({
    id: 'admin.documents.original',
    method: 'GET',
    path: '/admin/documents/:id/original',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'A 5-minute link to the unredacted original (every opening is audited)',
    permission: 'documents:read_private',
    returns: '{ url, expiresInSeconds }',
    handle: ({ services, ctx, params }) => services.documents.openOriginal(params['id']!, ctx),
  }),
  endpoint({
    id: 'admin.documents.presignRedacted',
    method: 'POST',
    path: '/admin/documents/:id/redacted',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Upload link for the redacted copy shown on the case page',
    permission: 'documents:redact',
    body: presignRedactedSchema,
    returns: 'UploadTicket',
    handle: ({ services, ctx, params, body }) => services.documents.presignRedacted(params['id']!, body, ctx),
  }),
  endpoint({
    id: 'admin.documents.confirmRedacted',
    method: 'POST',
    path: '/admin/documents/:id/redacted/confirm',
    version: '1',
    access: 'staff',
    tag: CASES,
    summary: 'Publish the uploaded redacted copy',
    permission: 'documents:redact',
    body: confirmRedactedSchema,
    returns: '{ publicUrl }',
    handle: ({ services, ctx, params, body }) => services.documents.confirmRedacted(params['id']!, body.key, ctx),
  }),
];

export const financeOperations = [
  endpoint({
    id: 'admin.ledger',
    method: 'GET',
    path: '/admin/ledger',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Double-entry ledger lines (donations, fees, refunds, payouts, settlements)',
    permission: 'finance:read',
    query: ledgerQuerySchema,
    returns: 'LedgerLine[]',
    handle: ({ services, ctx, query }) => services.admin.ledger(query, ctx),
  }),
  endpoint({
    id: 'admin.donations.list',
    method: 'GET',
    path: '/admin/donations',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Donations with masked donor contact',
    permission: 'finance:read',
    query: adminDonationsQuerySchema,
    returns: 'AdminDonation[]',
    handle: ({ services, ctx, query }) => services.admin.donations(query, ctx),
  }),
  endpoint({
    id: 'admin.donations.confirmTransfer',
    method: 'POST',
    path: '/admin/donations/:id/confirm-transfer',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Reconcile an InstaPay / bank transfer against the bank statement',
    description: 'The received amount must equal the amount the donor was asked to send (AMOUNT_MISMATCH otherwise).',
    permission: 'finance:reconcile',
    body: confirmTransferSchema,
    returns: 'AdminDonation',
    handle: async ({ services, ctx, params, body }) => {
      await services.donations.confirmTransfer(params['id']!, body, ctx);
      return services.admin.donation(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.refunds.request',
    method: 'POST',
    path: '/admin/donations/:id/refunds',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Request a refund (maker) — a second officer approves it',
    permission: 'finance:refunds',
    body: refundRequestSchema,
    status: 201,
    returns: 'Refund',
    handle: async ({ services, ctx, params, body }) => {
      const refund = await services.refunds.request(params['id']!, body, ctx);
      return services.admin.refund(refund.id, ctx);
    },
  }),
  endpoint({
    id: 'admin.refunds.list',
    method: 'GET',
    path: '/admin/refunds',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Refund requests and their approvals',
    permission: 'finance:read',
    returns: 'Refund[]',
    handle: ({ services, ctx }) => services.admin.refunds(ctx),
  }),
  endpoint({
    id: 'admin.refunds.approve',
    method: 'POST',
    path: '/admin/refunds/:id/approve',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Approve a refund (checker ≠ maker); calls the gateway and posts the ledger',
    permission: 'finance:approve',
    returns: 'Refund',
    handle: async ({ services, ctx, params }) => {
      await services.refunds.approve(params['id']!, ctx);
      return services.admin.refund(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.refunds.reject',
    method: 'POST',
    path: '/admin/refunds/:id/reject',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Reject a refund request',
    permission: 'finance:approve',
    body: rejectSchema,
    returns: 'Refund',
    handle: async ({ services, ctx, params, body }) => {
      await services.refunds.reject(params['id']!, body.reason, ctx);
      return services.admin.refund(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.payouts.list',
    method: 'GET',
    path: '/admin/payouts',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Payouts to hospitals, creditors, schools and vendors',
    permission: 'finance:read',
    returns: 'Payout[]',
    handle: ({ services, ctx }) => services.admin.payouts(ctx),
  }),
  endpoint({
    id: 'admin.payouts.request',
    method: 'POST',
    path: '/admin/payouts',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Request a payout for a line of the disbursement plan (maker)',
    description: 'Refused beyond what the case fund holds after pending payouts and approved refunds (INSUFFICIENT_CASE_FUNDS).',
    permission: 'finance:payouts',
    body: createPayoutSchema,
    status: 201,
    returns: 'Payout',
    handle: async ({ services, ctx, body }) => {
      const payout = await services.payouts.request(body, ctx);
      return services.admin.payout(payout.id, ctx);
    },
  }),
  endpoint({
    id: 'admin.payouts.approve',
    method: 'POST',
    path: '/admin/payouts/:id/approve',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Approve a payout (checker ≠ maker)',
    permission: 'finance:approve',
    returns: 'Payout',
    handle: async ({ services, ctx, params }) => {
      await services.payouts.approve(params['id']!, ctx);
      return services.admin.payout(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.payouts.reject',
    method: 'POST',
    path: '/admin/payouts/:id/reject',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Reject a payout request',
    permission: 'finance:approve',
    body: rejectSchema,
    returns: 'Payout',
    handle: async ({ services, ctx, params, body }) => {
      await services.payouts.reject(params['id']!, body.reason, ctx);
      return services.admin.payout(params['id']!, ctx);
    },
  }),
  endpoint({
    id: 'admin.payouts.markPaid',
    method: 'POST',
    path: '/admin/payouts/:id/mark-paid',
    version: '1',
    access: 'staff',
    tag: FINANCE,
    summary: 'Record the bank transfer; posts the ledger and tells the case’s donors where their money went',
    permission: 'finance:payouts',
    body: markPayoutPaidSchema,
    returns: 'Payout',
    handle: async ({ services, ctx, params, body }) => {
      await services.payouts.markPaid(params['id']!, body, ctx);
      return services.admin.payout(params['id']!, ctx);
    },
  }),
];

export const peopleOperations = [
  endpoint({
    id: 'admin.crm.donors',
    method: 'GET',
    path: '/admin/crm/donors',
    version: '1',
    access: 'staff',
    tag: PEOPLE,
    summary: 'Donors with giving totals and segments (contacts masked)',
    permission: 'crm:read',
    returns: 'DonorRow[]',
    handle: ({ services, ctx }) => services.admin.donors(ctx),
  }),
  endpoint({
    id: 'admin.crm.volunteers',
    method: 'GET',
    path: '/admin/crm/volunteers',
    version: '1',
    access: 'staff',
    tag: PEOPLE,
    summary: 'Field volunteers: submissions, visits, status',
    permission: 'crm:read',
    returns: 'VolunteerRow[]',
    handle: ({ services, ctx }) => services.admin.volunteers(ctx),
  }),
  endpoint({
    id: 'admin.team.list',
    method: 'GET',
    path: '/admin/team',
    version: '1',
    access: 'staff',
    tag: PEOPLE,
    summary: 'Staff, their roles and two-factor status',
    permission: 'cases:read',
    returns: 'TeamMember[]',
    handle: ({ services, ctx }) => services.admin.team(ctx),
  }),
  endpoint({
    id: 'admin.team.roles',
    method: 'PUT',
    path: '/admin/team/:id/roles',
    version: '1',
    access: 'staff',
    tag: PEOPLE,
    summary: 'Change someone’s roles (the platform always keeps one super admin)',
    permission: 'team:manage',
    body: updateRolesSchema,
    returns: 'TeamMember',
    handle: ({ services, ctx, params, body }) => services.team.updateRoles(params['id']!, body.roles, ctx),
  }),
  endpoint({
    id: 'admin.audit',
    method: 'GET',
    path: '/admin/audit',
    version: '1',
    access: 'staff',
    tag: PEOPLE,
    summary: 'Append-only audit log: who did what, when, before and after',
    permission: 'audit:read',
    query: auditQuerySchema,
    returns: 'AuditEntry[]',
    handle: ({ services, ctx, query }) => services.admin.audit(query.limit, ctx),
  }),
];
