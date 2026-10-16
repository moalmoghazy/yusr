import { DomainError, permissionsFor, type Permission } from '@yusr/core';
import { useCallback, useMemo } from 'react';
import { backend } from '../app/backend';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { useToast } from '../ui/primitives';

/** The current persona, its permissions and an RBAC-enforced API bound to it. */
export function useAdmin() {
  const { persona } = usePrototype();
  const { t } = useT();
  const toast = useToast();
  const grants = useMemo(() => permissionsFor(persona.roles), [persona]);
  const api = useMemo(() => backend.admin(persona), [persona]);
  const can = useCallback((permission: Permission) => grants.has(permission), [grants]);

  /** Runs an admin action and reports failures as a localized toast. */
  const run = useCallback(
    async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = await action();
        if (success) toast({ title: success, tone: 'success', icon: 'check' });
        return result;
      } catch (error) {
        const code = error instanceof DomainError ? error.code : 'generic';
        toast({ title: t('proto.admin.moveError'), body: t(`errors.${code}` as 'errors.generic'), tone: 'error', icon: 'alert' });
        return undefined;
      }
    },
    [toast, t],
  );

  return { persona, grants, can, api, run };
}

export function PermissionHint({ permission }: { permission: Permission }) {
  const { t } = useT();
  return <span className="permission-hint">{t('admin.cases.requiresPermission', { permission: t(`permissions.${permission}`) })}</span>;
}
