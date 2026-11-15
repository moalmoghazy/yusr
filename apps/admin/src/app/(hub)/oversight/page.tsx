import { FLAG_SEVERITY, OVERSIGHT_AREAS, OVERSIGHT_FLAGS, type OversightArea, type OversightItem, type OversightVerdict } from '@yusr/core';
import { Badge, cn, Icon, textFor, type BadgeTone } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/no-access';
import { OversightReviewForm } from '@/components/oversight-review-form';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.oversight.title') };
}

const SHOWS = ['open', 'reviewed', 'all'] as const;
type Show = (typeof SHOWS)[number];

const VERDICT_TONE: Record<OversightVerdict, BadgeTone> = { approved: 'success', needs_action: 'warning', escalated: 'urgent' };

/** Needs the director: something was raised and not approved since, or the latest verdict asked for action or escalated it. */
const isOpen = (item: OversightItem) => {
  const last = item.reviews[0]?.verdict;
  return last ? last !== 'approved' : item.severity !== null;
};

/**
 * «قسم المراجعة والتدقيق على العمل» (super admin only, oversight:review): cases, field verification and
 * follow-up after payout, each with what the operating plan's rules raise (from @yusr/core) and the
 * director's verdicts, which are append-only.
 */
export default async function OversightPage({ searchParams }: { searchParams: Promise<{ area?: string; show?: string }> }) {
  const [staff, locale, query] = await Promise.all([currentStaff(), hubLocale(), searchParams]);
  const { t, f, l } = textFor(locale);
  if (!staff.permissions.has('oversight:review')) return <NoAccess message={t('admin.noAccess')} />;

  const items = await (await adminApi()).oversight();
  const area: OversightArea = OVERSIGHT_AREAS.find((value) => value === query.area) ?? 'cases';
  const show: Show = SHOWS.find((value) => value === query.show) ?? 'open';
  const inArea = items.filter((item) => item.area === area);
  const shown = inArea.filter((item) => (show === 'all' ? true : show === 'open' ? isOpen(item) : item.reviews.length > 0 && !isOpen(item)));
  const count = (list: readonly OversightItem[], severity: 'high' | 'medium') => list.filter((item) => isOpen(item) && item.severity === severity).length;
  const link = (next: { area?: OversightArea; show?: Show }) =>
    `/oversight?${new URLSearchParams({ area: next.area ?? area, show: next.show ?? show }).toString()}`;
  const chip = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted',
    );
  const stats: Array<[string, number, string]> = [
    [t('admin.oversight.stats.high'), count(items, 'high'), 'text-destructive'],
    [t('admin.oversight.stats.medium'), count(items, 'medium'), 'text-warning-soft-foreground'],
    [t('admin.oversight.stats.open'), items.filter(isOpen).length, 'text-foreground'],
    [t('admin.oversight.stats.reviews'), items.reduce((sum, item) => sum + item.reviews.length, 0), 'text-primary'],
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Icon name="shield-check" size={24} className="text-primary" />
          {t('admin.oversight.title')}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('admin.oversight.subtitle')}</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value, tone]) => (
          <div key={label} className="flex flex-col gap-1 rounded-card border border-border bg-card p-4 shadow-sm">
            <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
            <dd className={cn('text-2xl font-bold tabular-nums', tone)}>{f.number(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <nav aria-label={t('admin.oversight.title')} className="flex flex-wrap gap-2 border-b border-border pb-3">
          {OVERSIGHT_AREAS.map((value) => {
            const open = items.filter((item) => item.area === value && isOpen(item)).length;
            return (
              <Link key={value} href={link({ area: value })} aria-current={value === area || undefined} className={chip(value === area)}>
                {t(`admin.oversight.areas.${value}`)}
                {open > 0 && <span className="rounded-full bg-destructive px-1.5 text-xs tabular-nums text-destructive-foreground">{f.number(open)}</span>}
              </Link>
            );
          })}
        </nav>
        <nav aria-label={t('admin.oversight.filters.all')} className="flex flex-wrap gap-2">
          {SHOWS.map((value) => (
            <Link
              key={value}
              href={link({ show: value })}
              aria-current={value === show || undefined}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                value === show ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`admin.oversight.filters.${value}`)}
            </Link>
          ))}
        </nav>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">{t('admin.oversight.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((item) => {
            const last = item.reviews[0];
            return (
              <li
                key={`${item.area}-${item.subjectId}`}
                className={cn(
                  'flex flex-col gap-3 rounded-card border bg-card p-4 shadow-sm',
                  item.severity === 'high' && isOpen(item) ? 'border-destructive/50' : 'border-border',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link href={`/cases?q=${encodeURIComponent(item.reference)}`} className="font-bold hover:text-primary">
                      {l(item.title)}
                    </Link>
                    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span dir="ltr" className="font-mono">
                        {item.reference}
                      </span>
                      {item.owner && <span>· {t(`admin.oversight.owner.${item.area}`, { name: item.owner })}</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={item.severity === 'high' ? 'urgent' : item.severity === 'medium' ? 'warning' : 'success'}>
                      {t(`admin.oversight.severity.${item.severity ?? 'none'}`)}
                    </Badge>
                    {last ? (
                      <Badge tone={VERDICT_TONE[last.verdict]}>{t(`admin.oversight.verdicts.${last.verdict}`)}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('admin.oversight.notReviewed')}</Badge>
                    )}
                  </div>
                </div>

                {item.flags.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {item.flags.map((flag) => (
                      <li key={flag} className="flex items-start gap-2 text-sm">
                        <Icon
                          name="alert"
                          size={16}
                          className={cn('mt-0.5 shrink-0', FLAG_SEVERITY[flag] === 'high' ? 'text-destructive' : 'text-warning-soft-foreground')}
                        />
                        {t(`admin.oversight.flags.${flag}`)}
                      </li>
                    ))}
                  </ul>
                )}

                {last && (
                  <div className="flex flex-col gap-1 rounded-control bg-muted/60 p-3 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {t('admin.oversight.lastReview', {
                        verdict: t(`admin.oversight.verdicts.${last.verdict}`),
                        name: last.reviewer.name,
                        date: f.date(last.createdAt, 'medium'),
                      })}
                    </p>
                    {last.note && (
                      <p className="whitespace-pre-line leading-relaxed" dir="auto">
                        {last.note}
                      </p>
                    )}
                  </div>
                )}

                {item.reviews.length > 1 && (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-primary">
                      <Icon name="history" size={16} />
                      {t('admin.oversight.history')} · {f.number(item.reviews.length)}
                      <Icon name="chevron-down" size={16} className="transition-transform group-open:rotate-180" />
                    </summary>
                    <ol className="mt-3 flex flex-col gap-3 border-s-2 border-border ps-4">
                      {item.reviews.slice(1).map((review) => (
                        <li key={review.id} className="flex flex-col gap-1 text-sm">
                          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge tone={VERDICT_TONE[review.verdict]}>{t(`admin.oversight.verdicts.${review.verdict}`)}</Badge>
                            {review.reviewer.name} · {f.date(review.createdAt, 'medium')}
                          </p>
                          {review.note && (
                            <p className="whitespace-pre-line" dir="auto">
                              {review.note}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}

                {/* Open items show the form; the rest keep it one click away. */}
                <details className="group/form" open={isOpen(item) || undefined}>
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-primary group-open/form:mb-2">
                    <Icon name="check" size={16} />
                    {t('admin.oversight.form.verdict')}
                    <Icon name="chevron-down" size={16} className="transition-transform group-open/form:rotate-180" />
                  </summary>
                  <OversightReviewForm locale={locale} area={item.area} subjectId={item.subjectId} caseId={item.caseId} />
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-card border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-bold">{t('admin.oversight.rulesTitle')}</summary>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('admin.oversight.rulesBody')}</p>
        <ul className="mt-3 grid grid-cols-1 gap-1.5 text-sm md:grid-cols-2">
          {OVERSIGHT_FLAGS.map((flag) => (
            <li key={flag} className="flex items-start gap-2">
              <Icon
                name="alert"
                size={15}
                className={cn('mt-0.5 shrink-0', FLAG_SEVERITY[flag] === 'high' ? 'text-destructive' : 'text-warning-soft-foreground')}
              />
              {t(`admin.oversight.flags.${flag}`)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
