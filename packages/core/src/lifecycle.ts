import { DomainError } from './errors';
import type { Permission } from './rbac';
import type { CaseStatus } from './types';

export interface TransitionRule {
  from: CaseStatus;
  to: CaseStatus;
  /** Permission required, or 'system' for transitions only the platform performs. */
  permission: Permission | 'system';
  requiresReason?: boolean;
}

/**
 * The verification pipeline. Every change of status is checked against this table
 * on the server, and the admin UI uses the same table to decide which buttons to show.
 */
export const CASE_TRANSITIONS: readonly TransitionRule[] = [
  { from: 'draft', to: 'under_review', permission: 'cases:submit' },
  { from: 'under_review', to: 'draft', permission: 'cases:review', requiresReason: true },
  { from: 'under_review', to: 'field_verified', permission: 'cases:verify' },
  { from: 'under_review', to: 'rejected', permission: 'cases:review', requiresReason: true },
  { from: 'field_verified', to: 'published', permission: 'cases:publish' },
  { from: 'field_verified', to: 'rejected', permission: 'cases:publish', requiresReason: true },
  { from: 'published', to: 'paused', permission: 'cases:pause', requiresReason: true },
  { from: 'paused', to: 'published', permission: 'cases:pause' },
  { from: 'published', to: 'funded', permission: 'system' },
  { from: 'funded', to: 'closed', permission: 'cases:close' },
  { from: 'published', to: 'closed', permission: 'cases:close', requiresReason: true },
  { from: 'paused', to: 'closed', permission: 'cases:close', requiresReason: true },
];

/** Main pipeline columns, in order, as shown on the admin board. */
export const CASE_PIPELINE: readonly CaseStatus[] = ['draft', 'under_review', 'field_verified', 'published', 'funded', 'closed'];

export type Grant = ReadonlySet<Permission> | 'system';

function allows(rule: TransitionRule, grant: Grant): boolean {
  if (grant === 'system') return rule.permission === 'system';
  return rule.permission !== 'system' && grant.has(rule.permission);
}

export function findTransition(from: CaseStatus, to: CaseStatus): TransitionRule | undefined {
  return CASE_TRANSITIONS.find((rule) => rule.from === from && rule.to === to);
}

export function canTransition(from: CaseStatus, to: CaseStatus, grant: Grant): boolean {
  const rule = findTransition(from, to);
  return rule !== undefined && allows(rule, grant);
}

export function allowedTransitions(from: CaseStatus, grant: Grant): TransitionRule[] {
  return CASE_TRANSITIONS.filter((rule) => rule.from === from && allows(rule, grant));
}

export function assertTransition(from: CaseStatus, to: CaseStatus, grant: Grant, reason?: string | null): TransitionRule {
  const rule = findTransition(from, to);
  if (!rule) throw new DomainError('INVALID_TRANSITION', `Cannot move a case from ${from} to ${to}`, { from, to });
  if (!allows(rule, grant)) {
    throw new DomainError('FORBIDDEN_TRANSITION', `Missing permission ${rule.permission} for ${from}→${to}`, {
      from,
      to,
      permission: rule.permission,
    });
  }
  if (rule.requiresReason && !reason?.trim()) {
    throw new DomainError('REASON_REQUIRED', `A reason is required for ${from}→${to}`, { from, to });
  }
  return rule;
}

/** Only published cases accept new donations. */
export function isDonatable(status: CaseStatus): boolean {
  return status === 'published';
}

/** Statuses visible on the public catalog and case pages. */
export function isPubliclyVisible(status: CaseStatus): boolean {
  return status === 'published' || status === 'funded' || status === 'closed';
}
