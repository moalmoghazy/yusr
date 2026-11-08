/**
 * «اطلب الاطلاع على الوثائق»: a visitor asks to see a case's documents (no account), and staff with
 * documents:share send them on WhatsApp as view-once images, then mark the request. The number is
 * staff only.
 */
import { documentRequestSchema, documentRequestStatusSchema, listQuerySchema } from '@yusr/core/schemas';
import { endpoint } from '../endpoint';

const REQUESTS = 'Operations · Document requests';

export const documentRequestEndpoints = [
  endpoint({
    id: 'cases.requestDocuments',
    method: 'POST',
    path: '/cases/:slug/document-requests',
    version: '1',
    access: 'public',
    tag: 'Submissions',
    summary: 'Ask to see a case’s documents; the team sends them on WhatsApp as view-once images',
    description: 'No account needed. Asking again from the same number while a request waits adds nothing.',
    body: documentRequestSchema,
    status: 202,
    returns: '{ received: true }',
    rateLimit: { name: 'documents:request', limit: 5, windowSeconds: 3_600, by: 'ip' },
    handle: ({ services, ctx, params, body }) => services.documentRequests.request(params['slug']!, body, ctx),
  }),
];

export const documentRequestOperations = [
  endpoint({
    id: 'admin.documentRequests.inbox',
    method: 'GET',
    path: '/admin/document-requests',
    version: '1',
    access: 'staff',
    tag: REQUESTS,
    summary: 'Requests to see case documents, newest first, with how many still wait',
    permission: 'documents:share',
    query: listQuerySchema,
    returns: 'DocumentRequestInbox',
    handle: ({ services, ctx, query }) => services.documentRequests.inbox(ctx, query.limit),
  }),
  endpoint({
    id: 'admin.documentRequests.status',
    method: 'POST',
    path: '/admin/document-requests/:id/status',
    version: '1',
    access: 'staff',
    tag: REQUESTS,
    summary: 'Mark a request as sent (documents went out on WhatsApp) or declined',
    permission: 'documents:share',
    body: documentRequestStatusSchema,
    returns: 'DocumentRequest',
    handle: ({ services, ctx, params, body }) => services.documentRequests.setStatus(params['id']!, body.status, ctx),
  }),
];
