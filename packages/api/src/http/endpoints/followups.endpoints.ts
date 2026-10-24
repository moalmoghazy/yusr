/**
 * Follow-up after funding («متابعة ما بعد الصرف»): Yusr keeps checking, as an independent third party,
 * that the help reached the beneficiary, also after the case closes. Anyone with cases:read sees the
 * board; cases:follow_up logs a call or visit.
 */
import { recordFollowupSchema } from '@yusr/core/schemas';
import { endpoint } from '../endpoint';

const FOLLOWUPS = 'Operations · Follow-up';

export const followupOperations = [
  endpoint({
    id: 'admin.followups.board',
    method: 'GET',
    path: '/admin/followups',
    version: '1',
    access: 'staff',
    tag: FOLLOWUPS,
    summary: 'Funded and closed cases with their latest follow-up, most pressing first',
    permission: 'cases:read',
    returns: 'FollowupCase[]',
    handle: ({ services, ctx }) => services.followups.board(ctx),
  }),
  endpoint({
    id: 'admin.followups.log',
    method: 'GET',
    path: '/admin/cases/:id/followups',
    version: '1',
    access: 'staff',
    tag: FOLLOWUPS,
    summary: 'A funded or closed case’s follow-up log, newest first',
    permission: 'cases:read',
    returns: 'FollowupLog',
    handle: ({ services, ctx, params }) => services.followups.log(params['id']!, ctx),
  }),
  endpoint({
    id: 'admin.followups.record',
    method: 'POST',
    path: '/admin/cases/:id/followups',
    version: '1',
    access: 'staff',
    tag: FOLLOWUPS,
    summary: 'Log a follow-up call or visit (append-only)',
    description: 'Only funded or closed cases. The next check, when given, must be after today (Cairo time).',
    permission: 'cases:follow_up',
    body: recordFollowupSchema,
    status: 201,
    returns: 'FollowupLog',
    handle: ({ services, ctx, params, body }) => services.followups.record(params['id']!, body, ctx),
  }),
];
