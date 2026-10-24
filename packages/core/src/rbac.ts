import type { Role } from './types';

export const PERMISSIONS = [
  'cases:read',
  'cases:submit',
  'cases:edit',
  'cases:review',
  'cases:verify',
  'cases:publish',
  'cases:pause',
  'cases:prioritize',
  'cases:close',
  'documents:read_private',
  'documents:redact',
  'verifications:assign',
  'verifications:perform',
  'finance:read',
  'finance:reconcile',
  'finance:refunds',
  'finance:payouts',
  'finance:approve',
  'crm:read',
  'volunteers:manage',
  'team:manage',
  'audit:read',
  'settings:manage',
  /** The approved-partner registry: add associations after contract signature, suspend them, issue «كود يُسر». */
  'partners:manage',
  /** Log follow-up calls and visits on funded and closed cases (reading the board needs only cases:read). */
  'cases:follow_up',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Least-privilege role matrix. Staff roles map 1:1 to the operating model:
 * auditors verify in the field, moderators own public content, finance owns money.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  donor: [],
  beneficiary: ['cases:submit'],
  volunteer: ['cases:submit'],
  field_auditor: ['cases:read', 'cases:review', 'cases:verify', 'cases:follow_up', 'documents:read_private', 'verifications:perform'],
  content_moderator: [
    'cases:read',
    'cases:edit',
    'cases:review',
    'cases:publish',
    'cases:pause',
    'cases:prioritize',
    'documents:redact',
    'verifications:assign',
    'volunteers:manage',
    'crm:read',
    'partners:manage',
    'cases:follow_up',
  ],
  financial_officer: ['cases:read', 'cases:close', 'finance:read', 'finance:reconcile', 'finance:refunds', 'finance:payouts', 'finance:approve', 'crm:read'],
  super_admin: PERMISSIONS,
};

export const STAFF_ROLES: readonly Role[] = ['field_auditor', 'content_moderator', 'financial_officer', 'super_admin'];

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  return result;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}
