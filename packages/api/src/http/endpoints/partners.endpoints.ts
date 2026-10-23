/**
 * The approved-partner registry in the control hub: content moderators (and super admins) add an
 * association after approval and contract signature, read and regenerate its «كود يُسر», and suspend or
 * reactivate it. The code appears only here, never on a public endpoint.
 */
import {
  createPartnerSchema,
  listQuerySchema,
  partnerApplicationSchema,
  partnerApplicationStatusSchema,
  partnerStatusSchema,
  updatePartnerSchema,
} from '@yusr/core/schemas';
import { endpoint } from '../endpoint';

const PARTNERS = 'Operations · Partners';

export const partnerOperations = [
  endpoint({
    id: 'admin.partners.list',
    method: 'GET',
    path: '/admin/partners',
    version: '1',
    access: 'staff',
    tag: PARTNERS,
    summary: 'Approved partner associations, with their status and «كود يُسر»',
    permission: 'partners:manage',
    returns: 'Partner[]',
    handle: ({ services, ctx }) => services.partners.list(ctx),
  }),
  endpoint({
    id: 'admin.partners.create',
    method: 'POST',
    path: '/admin/partners',
    version: '1',
    access: 'staff',
    tag: PARTNERS,
    summary: 'Add an association to the approved list (after contract signature) and issue its «كود يُسر»',
    description: 'رقم الإشهار is unique in the registry. The contract date cannot be in the future.',
    permission: 'partners:manage',
    body: createPartnerSchema,
    status: 201,
    returns: 'Partner',
    handle: ({ services, ctx, body }) => services.partners.create(body, ctx),
  }),
  endpoint({
    id: 'admin.partners.update',
    method: 'PATCH',
    path: '/admin/partners/:id',
    version: '1',
    access: 'staff',
    tag: PARTNERS,
    summary: 'Correct a partner’s details (its cases show the new name and number)',
    permission: 'partners:manage',
    body: updatePartnerSchema,
    returns: 'Partner',
    handle: ({ services, ctx, params, body }) => services.partners.update(params['id']!, body, ctx),
  }),
  endpoint({
    id: 'admin.partners.status',
    method: 'POST',
    path: '/admin/partners/:id/status',
    version: '1',
    access: 'staff',
    tag: PARTNERS,
    summary: 'Suspend a partner (its code stops working at once) or reactivate it',
    permission: 'partners:manage',
    body: partnerStatusSchema,
    returns: 'Partner',
    handle: ({ services, ctx, params, body }) => services.partners.setStatus(params['id']!, body.status, body.reason, ctx),
  }),
  endpoint({
    id: 'admin.partners.regenerateCode',
    method: 'POST',
    path: '/admin/partners/:id/code',
    version: '1',
    access: 'staff',
    tag: PARTNERS,
    summary: 'Issue a new «كود يُسر»; the old one stops working at once',
    permission: 'partners:manage',
    returns: 'Partner',
    handle: ({ services, ctx, params }) => services.partners.regenerateCode(params['id']!, ctx),
  }),
  endpoint({
    id: 'admin.partners.applications',
    method: 'GET',
    path: '/admin/partner-applications',
    version: '1',
    access: 'staff',
    tag: PARTNERS,
    summary: 'Join requests from associations («انضم كجمعية شريكة»), newest first',
    permission: 'partners:manage',
    query: listQuerySchema,
    returns: 'PartnerApplication[]',
    handle: ({ services, ctx, query }) => services.partners.applications(ctx, query.limit),
  }),
  endpoint({
    id: 'admin.partners.applicationStatus',
    method: 'POST',
    path: '/admin/partner-applications/:id/status',
    version: '1',
    access: 'staff',
    tag: PARTNERS,
    summary: 'Mark a join request as contacted, approved or rejected',
    permission: 'partners:manage',
    body: partnerApplicationStatusSchema,
    returns: 'PartnerApplication',
    handle: ({ services, ctx, params, body }) => services.partners.setApplicationStatus(params['id']!, body.status, ctx),
  }),
];

/** The public side: an association asks to join, without an account. */
export const partnerApplicationEndpoints = [
  endpoint({
    id: 'partners.apply',
    method: 'POST',
    path: '/partner-applications',
    version: '1',
    access: 'public',
    tag: 'Submissions',
    summary: 'An association asks to become a Yusr partner (the team contacts it)',
    body: partnerApplicationSchema,
    status: 202,
    returns: '{ received: true }',
    rateLimit: { name: 'partners:apply', limit: 5, windowSeconds: 3_600, by: 'ip' },
    handle: ({ services, ctx, body }) => services.partners.apply(body, ctx),
  }),
];
