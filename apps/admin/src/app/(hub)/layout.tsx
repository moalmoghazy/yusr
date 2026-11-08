import { canSeeSentMessages, type Permission } from '@yusr/core';
import { buttonClasses, Icon, Logo, textFor, type IconName } from '@yusr/ui';
import type { ReactNode } from 'react';
import { signOut, switchLocale } from '@/app/actions';
import { HubNav, type HubNavItem } from '@/components/hub-nav';
import { onDemoData } from '@/lib/env';
import { hubLocale } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

/** Each section shows when the staff member holds any of its permissions (the API re-checks every call). */
const SECTIONS: ReadonlyArray<{
  href: string;
  key: 'overview' | 'cases' | 'verification' | 'followups' | 'documentRequests' | 'finance' | 'crm' | 'partners' | 'showcase' | 'audit';
  icon: IconName;
  anyOf: readonly Permission[];
}> = [
  { href: '/', key: 'overview', icon: 'grid', anyOf: ['cases:read'] },
  { href: '/cases', key: 'cases', icon: 'kanban', anyOf: ['cases:read'] },
  { href: '/verification', key: 'verification', icon: 'clipboard-check', anyOf: ['verifications:assign', 'verifications:perform'] },
  { href: '/followups', key: 'followups', icon: 'eye', anyOf: ['cases:read'] },
  { href: '/document-requests', key: 'documentRequests', icon: 'file-text', anyOf: ['documents:share'] },
  { href: '/finance', key: 'finance', icon: 'landmark', anyOf: ['finance:read'] },
  { href: '/people', key: 'crm', icon: 'users', anyOf: ['cases:read'] },
  { href: '/partners', key: 'partners', icon: 'hand-heart', anyOf: ['partners:manage'] },
  { href: '/showcase', key: 'showcase', icon: 'layers', anyOf: ['partners:manage'] },
  { href: '/audit', key: 'audit', icon: 'history', anyOf: ['audit:read'] },
];

export default async function HubLayout({ children }: { children: ReactNode }) {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f } = textFor(locale);
  // «طلبات الاطلاع»: how many visitors still wait for documents, as a counter on the nav item.
  const waiting = staff.permissions.has('documents:share') ? await documentRequestsWaiting() : 0;
  const items: HubNavItem[] = SECTIONS.filter((section) => section.anyOf.some((permission) => staff.permissions.has(permission))).map((section) => ({
    href: section.href,
    icon: section.icon,
    label: t(`admin.nav.${section.key}`),
    count: section.key === 'documentRequests' && waiting > 0 ? f.number(waiting) : undefined,
  }));
  // «الرسائل المرسلة»: demo data only, for super admins and content moderators.
  if (onDemoData() && canSeeSentMessages(staff.claims.roles)) items.push({ href: '/messages', icon: 'send', label: t('admin.messages.nav') });
  const roles = staff.claims.roles.filter((role) => role !== 'donor');

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 border-b border-border bg-card p-4 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between gap-2">
          <Logo locale={locale} size={28} />
          <span className="rounded-chip bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{t('admin.title')}</span>
        </div>
        <HubNav items={items} label={t('admin.title')} />
        <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-col">
            <span className="font-semibold">{staff.claims.name}</span>
            <span className="text-xs text-muted-foreground">
              {t('admin.viewingAs')}: {roles.map((role) => t(`roles.${role}`)).join('، ')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={switchLocale}>
              <input type="hidden" name="locale" value={locale === 'ar' ? 'en' : 'ar'} />
              <button type="submit" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
                <Icon name="languages" size={16} />
                {t('nav.switchLanguage')}
              </button>
            </form>
            <form action={signOut}>
              <button type="submit" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
                <Icon name="log-out" size={16} />
                {t('common.signOut')}
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}

/** The nav counter must never take the hub down: on any failure it is simply not shown. */
async function documentRequestsWaiting(): Promise<number> {
  try {
    return (await (await adminApi()).documentRequests(1)).waiting;
  } catch {
    return 0;
  }
}
