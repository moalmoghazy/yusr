/**
 * «قسم المراجعة والتدقيق على العمل»: the super admin's review of cases, field verification and follow-up
 * after payout (oversight:review, held by super admins only).
 */
import { oversightReviewSchema } from '@yusr/core/schemas';
import { endpoint } from '../endpoint';

const OVERSIGHT = 'Operations · Oversight';

export const oversightOperations = [
  endpoint({
    id: 'admin.oversight.board',
    method: 'GET',
    path: '/admin/oversight',
    version: '1',
    access: 'staff',
    tag: OVERSIGHT,
    summary: 'Cases, field verifications and follow-ups with what the review rules raise, and the verdicts given',
    permission: 'oversight:review',
    returns: 'OversightItem[]',
    handle: ({ services, ctx }) => services.oversight.board(ctx),
  }),
  endpoint({
    id: 'admin.oversight.review',
    method: 'POST',
    path: '/admin/oversight/reviews',
    version: '1',
    access: 'staff',
    tag: OVERSIGHT,
    summary: 'Record a verdict on a case, a field verification or a follow-up (append-only)',
    description: 'A note is required unless the verdict is approved.',
    permission: 'oversight:review',
    body: oversightReviewSchema,
    returns: 'OversightReview',
    handle: ({ services, ctx, body }) => services.oversight.record(body, ctx),
  }),
];
