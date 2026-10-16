import { hasPermission, isStaff, type Permission, type Role } from '@yusr/core';
import { DomainError } from '@yusr/core';

/** The authenticated caller, as established by the JWT guard. */
export interface RequestActor {
  id: string;
  name: string;
  roles: Role[];
  /** Staff sessions must have completed a second factor. */
  mfa: boolean;
}

export interface CallContext {
  actor: RequestActor | null;
  ip?: string | null;
  requestId?: string | null;
  channel?: 'web' | 'mobile' | 'admin';
}

export function primaryRole(actor: RequestActor): Role {
  const order: Role[] = ['super_admin', 'financial_officer', 'content_moderator', 'field_auditor', 'volunteer', 'beneficiary', 'donor'];
  return order.find((role) => actor.roles.includes(role)) ?? 'donor';
}

/** Throws FORBIDDEN unless the actor holds `permission` (staff also need an MFA session). */
export function requirePermission(actor: RequestActor | null, permission: Permission): RequestActor {
  if (!actor) throw new DomainError('FORBIDDEN', 'Sign in required');
  if (!hasPermission(actor.roles, permission)) {
    throw new DomainError('FORBIDDEN', `Missing permission ${permission}`, { permission });
  }
  if (isStaff(actor.roles) && !actor.mfa) {
    throw new DomainError('FORBIDDEN', 'Staff actions require two-factor authentication', { mfaRequired: true });
  }
  return actor;
}
