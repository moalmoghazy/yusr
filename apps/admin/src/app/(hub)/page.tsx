import type { ActivityItem, AdminOverview, Locale, SeriesPoint } from '@yusr/core';
import { Icon, textFor, type IconName } from '@yusr/ui';
import { NoAccess } from '@/components/no-access';
import { hubLocale } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export default async function OverviewPage() {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f } = textFor(locale);
  if (!staff.permissions.has('cases:read')) return <NoAccess message={t('admin.noAccess')} />;
  const overview = await (await adminApi()).overview();
  const { kpis } = overview;

  const cards: Array<{ icon: IconName; label: string; value: string; sub?: string; tone?: 'warning' }> = [
    {
      icon: 'heart',
      label: t('admin.kpi.donationsToday'),
      value: f.money(kpis.donationsTodayMinor, 'EGP', { compact: true }),
      sub: t('units.donations', { count: kpis.donationsTodayCount }),
    },
    { icon: 'trend-up', label: t('admin.kpi.donationsMonth'), value: f.money(kpis.donationsMonthMinor, 'EGP', { compact: true }) },
    { icon: 'clipboard-check', label: t('admin.kpi.activeCases'), value: f.number(kpis.activeCases) },
    { icon: 'eye', label: t('admin.kpi.pendingReview'), value: f.number(kpis.pendingReview), tone: kpis.pendingReview > 0 ? 'warning' : undefined },
    {
      icon: 'landmark',
      label: t('admin.kpi.awaitingTransfers'),
      value: f.number(kpis.awaitingTransfers),
      tone: kpis.awaitingTransfers > 0 ? 'warning' : undefined,
    },
    { icon: 'clock', label: t('admin.kpi.hoursToFund'), value: f.number(kpis.medianHoursToFund) },
    { icon: 'coins', label: t('admin.kpi.feesMonth'), value: f.money(kpis.feesMonthMinor, 'EGP', { compact: true }) },
    { icon: 'refresh', label: t('admin.kpi.refundsOpen'), value: f.number(kpis.refundsOpen), tone: kpis.refundsOpen > 0 ? 'warning' : undefined },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('admin.nav.overview')}</h1>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="flex flex-col gap-1 rounded-card border border-border bg-card p-4">
            <dt className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Icon name={card.icon} size={15} className={card.tone === 'warning' ? 'text-warning' : 'text-primary'} />
              {card.label}
            </dt>
            <dd className="text-2xl font-bold tabular-nums">{card.value}</dd>
            {card.sub && <dd className="text-xs text-muted-foreground">{card.sub}</dd>}
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-card border border-border bg-card p-5" aria-labelledby="series-title">
          <h2 id="series-title" className="mb-4 font-bold">
            {t('admin.charts.donations30d')}
          </h2>
          <DailyBars series={overview.series} locale={locale} />
        </section>
        <section className="rounded-card border border-border bg-card p-5" aria-labelledby="methods-title">
          <h2 id="methods-title" className="mb-4 font-bold">
            {t('admin.charts.byMethod')}
          </h2>
          <MethodBars rows={overview.byMethod} locale={locale} />
        </section>
      </div>

      <section className="rounded-card border border-border bg-card p-5" aria-labelledby="activity-title">
        <h2 id="activity-title" className="mb-2 font-bold">
          {t('admin.activity')}
        </h2>
        <ul className="divide-y divide-border">
          {overview.activity.slice(0, 12).map((item) => (
            <Activity key={item.id} item={item} locale={locale} />
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Thirty days of donations: one series, one hue, bars anchored on the baseline with a 2px gap,
 * three quiet gridlines. Each bar carries a native tooltip, and the same numbers are in a table
 * for screen readers. Time runs left to right in both languages, like the ledger's dates.
 */
function DailyBars({ series, locale }: { series: SeriesPoint[]; locale: Locale }) {
  const { t, f } = textFor(locale);
  const width = 640;
  const height = 220;
  const pad = { top: 10, bottom: 26, start: 56 };
  const max = Math.max(1, ...series.map((point) => point.amountMinor));
  const plotW = width - pad.start;
  const plotH = height - pad.top - pad.bottom;
  const step = plotW / Math.max(1, series.length);
  const barW = Math.max(2, step - 2);
  const y = (value: number) => pad.top + plotH - (value / max) * plotH;
  const ticks = [0, 0.5, 1].map((share) => share * max);
  const labelled = new Set([0, Math.floor(series.length / 2), series.length - 1]);

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" direction="ltr" role="img" aria-label={t('admin.charts.donations30d')}>
        {ticks.map((value) => (
          <g key={value}>
            <line x1={pad.start} x2={width} y1={y(value)} y2={y(value)} stroke="var(--border)" strokeDasharray={value === 0 ? undefined : '3 4'} />
            <text x={pad.start - 8} y={y(value) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
              {f.money(value, 'EGP', { compact: true, showCurrency: false })}
            </text>
          </g>
        ))}
        {series.map((point, index) => {
          const x = pad.start + index * step + 1;
          const top = y(point.amountMinor);
          const h = pad.top + plotH - top;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={point.date}>
              <path
                d={`M${x} ${pad.top + plotH} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + barW - r} Q${x + barW} ${top} ${x + barW} ${top + r} V${pad.top + plotH} Z`}
                fill="var(--primary)"
              >
                <title>{`${f.date(point.date, 'medium')} — ${f.money(point.amountMinor, 'EGP')} · ${t('units.donations', { count: point.count })}`}</title>
              </path>
              {labelled.has(index) && (
                <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                  {f.date(point.date, 'short')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <tbody>
          {series.map((point) => (
            <tr key={point.date}>
              <th scope="row">{f.date(point.date, 'medium')}</th>
              <td>{f.money(point.amountMinor, 'EGP')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function MethodBars({ rows, locale }: { rows: AdminOverview['byMethod']; locale: Locale }) {
  const { t, f } = textFor(locale);
  const max = Math.max(1, ...rows.map((row) => row.amountMinor));
  return (
    <ul className="flex flex-col gap-3">
      {[...rows]
        .sort((a, b) => b.amountMinor - a.amountMinor)
        .map((row) => (
          <li key={row.method} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{t(`payment.methods.${row.method}`)}</span>
              <span className="tabular-nums text-muted-foreground">
                {f.money(row.amountMinor, 'EGP', { compact: true })} · {f.number(row.count)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1.5, (row.amountMinor / max) * 100)}%` }} />
            </div>
          </li>
        ))}
    </ul>
  );
}

const ACTIVITY_ICON: Record<ActivityItem['kind'], IconName> = {
  donation: 'heart',
  case: 'clipboard-check',
  payout: 'landmark',
  refund: 'refresh',
  verification: 'shield-check',
};

function Activity({ item, locale }: { item: ActivityItem; locale: Locale }) {
  const { t, f, l } = textFor(locale);
  const title = item.caseTitle ? l(item.caseTitle) : '';
  const amount = item.amountMinor !== null && item.currency ? f.money(item.amountMinor, item.currency, { fractionDigits: 0 }) : '';
  const text =
    item.kind === 'donation'
      ? `${t('landing.liveDonation', { name: item.actorName ? l(item.actorName) : t('case.anonymous'), amount })} — ${title}`
      : item.kind === 'case'
        ? `${title} → ${item.status ? t(`status.${item.status}`) : ''}`
        : item.kind === 'payout'
          ? `${t('admin.finance.payouts')}: ${amount} — ${title}`
          : item.kind === 'refund'
            ? `${t('admin.finance.refunds')}: ${amount} — ${title}`
            : `${t('admin.nav.verification')}: ${title}`;
  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-primary">
        <Icon name={ACTIVITY_ICON[item.kind]} size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground">
        {f.relative(item.at)}
      </time>
    </li>
  );
}
