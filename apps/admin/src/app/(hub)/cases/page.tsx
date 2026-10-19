import { allowedTransitions, CASE_STATUSES, type CaseStatus } from '@yusr/core';
import { CategoryBadge, cn, Icon, ProgressBar, StatusBadge, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CaseActions } from '@/components/case-actions';
import { NoAccess } from '@/components/no-access';
import { ShareTextForm } from '@/components/share-text-form';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.cases') };
}

const TABS: ReadonlyArray<CaseStatus | 'all'> = ['all', 'under_review', 'field_verified', 'published', 'paused', 'funded', 'closed', 'draft', 'rejected'];

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f, l } = textFor(locale);
  if (!staff.permissions.has('cases:read')) return <NoAccess message={t('admin.noAccess')} />;

  const query = await searchParams;
  const status = (CASE_STATUSES as readonly string[]).includes(query.status ?? '') ? (query.status as CaseStatus) : null;
  const q = query.q?.trim() || undefined;
  const all = await (await adminApi()).cases({ q });
  const rows = status ? all.filter((item) => item.status === status) : all;
  const count = (tab: CaseStatus | 'all') => (tab === 'all' ? all.length : all.filter((item) => item.status === tab).length);
  const tabHref = (tab: CaseStatus | 'all') => `/cases?${new URLSearchParams({ ...(tab === 'all' ? {} : { status: tab }), ...(q ? { q } : {}) }).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('admin.nav.cases')}</h1>
        <form className="relative w-full max-w-xs" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <Icon name="search" size={17} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t('admin.cases.searchPlaceholder')}
            aria-label={t('admin.cases.searchPlaceholder')}
            className="h-10 w-full rounded-control border border-input bg-card pe-3 ps-9 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
        </form>
      </div>

      <nav aria-label={t('admin.cases.board')} className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => {
          const current = (tab === 'all' && !status) || tab === status;
          return (
            <Link
              key={tab}
              href={tabHref(tab)}
              aria-current={current ? 'page' : undefined}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold',
                current ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'all' ? t('common.all') : t(`status.${tab}`)} <span className="text-xs tabular-nums opacity-70">{f.number(count(tab))}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-10 text-center text-muted-foreground">{t('admin.cases.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-muted/60 text-start text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 text-start font-semibold">
                  {t('case.reference')}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {t('receipt.case')}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {t('receipt.status')}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {t('admin.cases.raised')}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {t('admin.cases.updated')}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {t('admin.cases.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((item) => {
                const percent = Math.min(100, Math.floor((item.raisedMinor / item.goalMinor) * 100));
                const options = allowedTransitions(item.status, staff.permissions)
                  .filter((rule) => rule.permission !== 'system')
                  .map((rule) => ({ to: rule.to, requiresReason: Boolean(rule.requiresReason) }));
                return (
                  <tr key={item.id} className="align-top">
                    <td className="whitespace-nowrap p-3 font-mono text-xs" dir="ltr">
                      {item.reference}
                      {item.priority > 0 && <Icon name="pin" size={13} className="ms-1 inline text-highlight" label={t('admin.cases.pinned')} />}
                    </td>
                    <td className="max-w-[22rem] p-3">
                      <p className="font-semibold">{l(item.title)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <CategoryBadge category={item.category} locale={locale} />
                        {item.auditor && (
                          <span>
                            {t('admin.cases.auditor')}: {item.auditor.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={item.status} locale={locale} />
                      {item.isUrgent && <p className="mt-1 text-xs font-semibold text-destructive">{t('case.urgent')}</p>}
                    </td>
                    <td className="w-44 p-3">
                      <p className="mb-1.5 text-xs tabular-nums">
                        {f.money(item.raisedMinor, item.currency, { compact: true })} / {f.money(item.goalMinor, item.currency, { compact: true })}
                      </p>
                      <ProgressBar
                        value={percent}
                        label={t('a11y.progress', { percent: f.percent(percent) })}
                        size="sm"
                        complete={item.raisedMinor >= item.goalMinor}
                      />
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                      <time dateTime={item.updatedAt}>{f.relative(item.updatedAt)}</time>
                    </td>
                    <td className="p-3">
                      <CaseActions
                        locale={locale}
                        caseId={item.id}
                        options={options}
                        pinned={item.priority > 0}
                        canPin={staff.permissions.has('cases:prioritize')}
                      />
                      {staff.permissions.has('cases:edit') && (
                        <ShareTextForm locale={locale} caseId={item.id} title={item.title} category={item.category} shareText={item.shareText} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
