import { cairoDay, FOLLOWUP_STATES, type FollowupOutcome, type FollowupState } from '@yusr/core';
import { Badge, cn, Icon, textFor, type BadgeTone } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FollowupPanel } from '@/components/followup-form';
import { NoAccess } from '@/components/no-access';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.followups') };
}

const STATE_TONE: Record<FollowupState, BadgeTone> = { concern: 'urgent', due: 'warning', pending: 'gold', ok: 'success' };
const OUTCOME_TONE: Record<FollowupOutcome, BadgeTone> = { confirmed: 'success', concern: 'urgent', unreachable: 'warning' };

/**
 * «متابعة ما بعد الصرف». Gifts reach the partner association directly and it pays the institution; Yusr
 * then checks, as an independent third party, that the help reached the beneficiary, also after the case
 * closes. Every funded and closed case is here, most pressing first, with its whole log. Anyone who reads
 * cases sees the board; field auditors and content moderators (cases:follow_up) log calls and visits.
 */
export default async function FollowupsPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const [staff, locale, query] = await Promise.all([currentStaff(), hubLocale(), searchParams]);
  const { t, f, l } = textFor(locale);
  if (!staff.permissions.has('cases:read')) return <NoAccess message={t('admin.noAccess')} />;

  const api = await adminApi();
  const board = await api.followups();
  const canRecord = staff.permissions.has('cases:follow_up');
  const filter = FOLLOWUP_STATES.find((state) => state === query.state) ?? null;
  const shown = filter ? board.filter((item) => item.state === filter) : board;
  const today = cairoDay(new Date());
  const tomorrow = cairoDay(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const day = (value: string) => f.date(`${value}T12:00:00Z`, 'medium');
  const chip = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted',
    );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">{t('admin.followups.title')}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('admin.followups.subtitle')}</p>
      </header>

      <nav aria-label={t('admin.followups.title')} className="flex flex-wrap gap-2">
        <Link href="/followups" className={chip(filter === null)}>
          {t('admin.followups.all')}
          <span className="tabular-nums opacity-80">{f.number(board.length)}</span>
        </Link>
        {FOLLOWUP_STATES.map((state) => (
          <Link key={state} href={`/followups?state=${state}`} className={chip(filter === state)}>
            {t(`admin.followups.states.${state}`)}
            <span className="tabular-nums opacity-80">{f.number(board.filter((item) => item.state === state).length)}</span>
          </Link>
        ))}
      </nav>

      {!canRecord && (
        <p className="flex items-start gap-2 rounded-control bg-info-soft p-3 text-sm text-info-soft-foreground">
          <Icon name="info" size={17} className="mt-0.5 shrink-0" />
          {t('admin.followups.readOnly')}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">{t('admin.followups.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((item) => (
            <li key={item.caseId} className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/cases?q=${encodeURIComponent(item.reference)}`} className="font-bold hover:text-primary">
                    {l(item.title)}
                  </Link>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span dir="ltr" className="font-mono">
                      {item.reference}
                    </span>
                    {item.partnerName && <span>· {t('admin.followups.partner', { name: item.partnerName })}</span>}
                    {item.fundedAt && <span>· {t('admin.followups.fundedOn', { date: f.date(item.fundedAt, 'medium') })}</span>}
                    {item.closedAt && <span>· {t('admin.followups.closedOn', { date: f.date(item.closedAt, 'medium') })}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{t(`status.${item.status}`)}</Badge>
                  <Badge tone={STATE_TONE[item.state]}>{t(`admin.followups.states.${item.state}`)}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex flex-col gap-1.5 rounded-control bg-muted/60 p-3">
                  <span className="text-xs font-semibold text-muted-foreground">{t('admin.followups.last')}</span>
                  {item.last ? (
                    <>
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {t(`admin.followups.kinds.${item.last.kind}`)}
                        <Badge tone={OUTCOME_TONE[item.last.outcome]}>{t(`admin.followups.outcomes.${item.last.outcome}`)}</Badge>
                      </p>
                      <p className="whitespace-pre-line text-sm leading-relaxed" dir="auto">
                        {item.last.note}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('admin.followups.by', { name: item.last.recordedBy.name, date: f.date(item.last.recordedAt, 'medium') })}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('admin.followups.noChecks')}</p>
                  )}
                </div>
                <p
                  className={cn(
                    'flex items-center gap-1.5 self-start rounded-control px-3 py-2 text-sm font-semibold',
                    item.nextDueOn && item.nextDueOn <= today ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon name="calendar" size={16} />
                  {item.nextDueOn
                    ? item.nextDueOn <= today
                      ? t('admin.followups.overdue', { date: day(item.nextDueOn) })
                      : t('admin.followups.nextDue', { date: day(item.nextDueOn) })
                    : t('admin.followups.noNext')}
                </p>
              </div>

              {item.entries.length > 1 && (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-primary">
                    <Icon name="history" size={16} />
                    {t('admin.followups.history')} · {t('admin.followups.entries', { count: item.count })}
                    <Icon name="chevron-down" size={16} className="transition-transform group-open:rotate-180" />
                  </summary>
                  <ol className="mt-3 flex flex-col gap-3 border-s-2 border-border ps-4">
                    {item.entries.slice(1).map((entry) => (
                      <li key={entry.id} className="flex flex-col gap-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          {t(`admin.followups.kinds.${entry.kind}`)}
                          <Badge tone={OUTCOME_TONE[entry.outcome]}>{t(`admin.followups.outcomes.${entry.outcome}`)}</Badge>
                        </p>
                        <p className="whitespace-pre-line text-sm leading-relaxed" dir="auto">
                          {entry.note}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('admin.followups.by', { name: entry.recordedBy.name, date: f.date(entry.recordedAt, 'medium') })}
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              {canRecord && <FollowupPanel locale={locale} caseId={item.caseId} tomorrow={tomorrow} open={item.state === 'pending' || item.state === 'due'} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
