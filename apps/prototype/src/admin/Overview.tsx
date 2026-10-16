import { CASE_PIPELINE, type CaseStatus } from '@yusr/core';
import { useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useL, useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { categoryIcon } from '../ui/case-ui';
import { Icon } from '../ui/icons';
import { Badge } from '../ui/primitives';
import { METHOD_ICON } from '../web/donation';
import { AreaChart, BarList, Sparkline, StatTile } from './charts';

export function OverviewSection() {
  const { t, f } = useT();
  const l = useL();
  const now = useNow();
  const { goAdmin } = usePrototype();
  const overview = useRead((read) => read.overview());
  const balance = useRead((read) => read.ledgerBalance());
  const cases = useRead((read) => read.adminCases());
  const { kpis } = overview;
  const recent = overview.series.slice(-14).map((point) => point.amountMinor);
  const counts = CASE_PIPELINE.reduce<Record<string, number>>(
    (acc, status) => ({ ...acc, [status]: cases.filter((item) => item.status === status).length }),
    {},
  );

  return (
    <div className="admin-stack">
      <div className="admin-row-between">
        <p className="muted">{t('proto.admin.egpEquivalent')}</p>
        <Badge tone={balance.balanced ? 'success' : 'urgent'} icon={balance.balanced ? 'check' : 'alert'}>
          {balance.balanced ? t('admin.finance.balanced') : t('admin.finance.unbalanced')} · {f.number(balance.lines)}
        </Badge>
      </div>

      <div className="stat-grid">
        <StatTile
          label={t('admin.kpi.donationsToday')}
          value={f.money(kpis.donationsTodayMinor, 'EGP', { fractionDigits: 0 })}
          hint={t('units.donations', { count: kpis.donationsTodayCount })}
          icon="heart"
        >
          <Sparkline values={recent} />
        </StatTile>
        <StatTile label={t('admin.kpi.donationsMonth')} value={f.money(kpis.donationsMonthMinor, 'EGP', { compact: true })} icon="trend-up" />
        <StatTile label={t('admin.kpi.activeCases')} value={f.number(kpis.activeCases)} icon="kanban" />
        <StatTile
          label={t('admin.kpi.pendingReview')}
          value={f.number(kpis.pendingReview)}
          icon="clipboard-check"
          tone={kpis.pendingReview > 0 ? 'warning' : 'default'}
        />
      </div>
      <div className="stat-grid stat-grid-small">
        <StatTile
          label={t('admin.kpi.awaitingTransfers')}
          value={f.number(kpis.awaitingTransfers)}
          icon="landmark"
          tone={kpis.awaitingTransfers > 0 ? 'warning' : 'default'}
        />
        <StatTile label={t('admin.kpi.feesMonth')} value={f.money(kpis.feesMonthMinor, 'EGP', { fractionDigits: 0 })} icon="receipt" />
        <StatTile label={t('admin.kpi.hoursToFund')} value={f.number(kpis.medianHoursToFund)} icon="clock" />
        <StatTile label={t('admin.kpi.refundsOpen')} value={f.number(kpis.refundsOpen)} icon="refresh" />
      </div>

      <div className="admin-grid-2">
        <section className="panel chart-panel">
          <h2 className="panel-title">{t('admin.charts.donations30d')}</h2>
          <AreaChart
            points={overview.series}
            currency="EGP"
            label={t('admin.charts.donations30d')}
            tableLabel={t('proto.admin.tableView')}
            chartLabel={t('proto.admin.chartView')}
          />
        </section>
        <section className="panel">
          <h2 className="panel-title">{t('proto.admin.pipelineCounts')}</h2>
          <ol className="pipeline-mini">
            {CASE_PIPELINE.map((status: CaseStatus) => (
              <li key={status}>
                <button type="button" onClick={() => goAdmin({ section: 'cases' })}>
                  <span>{t(`status.${status}`)}</span>
                  <strong>{f.number(counts[status] ?? 0)}</strong>
                </button>
              </li>
            ))}
          </ol>
          <h2 className="panel-title panel-title-spaced">{t('admin.activity')}</h2>
          <ul className="activity">
            {overview.activity.slice(0, 7).map((item) => (
              <li key={item.id}>
                <span className={`activity-icon activity-${item.kind}`}>
                  <Icon name={item.kind === 'donation' ? 'heart' : item.kind === 'payout' ? 'landmark' : 'kanban'} size={14} />
                </span>
                <span className="activity-text">
                  {item.kind === 'donation' ? (
                    <>
                      <strong>{l(item.actorName) ?? t('case.anonymous')}</strong> ·{' '}
                      {item.amountMinor !== null && item.currency ? f.money(item.amountMinor, item.currency) : ''}
                    </>
                  ) : (
                    <>
                      <strong>{l(item.actorName)}</strong> ·{' '}
                      {item.status ? t(`status.${item.status}`) : item.amountMinor !== null && item.currency ? f.money(item.amountMinor, item.currency) : ''}
                    </>
                  )}
                  <small>{l(item.caseTitle)}</small>
                </span>
                <time dateTime={item.at}>{f.relative(item.at, now)}</time>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="admin-grid-2 admin-grid-even">
        <section className="panel">
          <h2 className="panel-title">{t('admin.charts.byMethod')}</h2>
          <BarList
            label={t('admin.charts.byMethod')}
            items={overview.byMethod.map((row) => ({
              key: row.method,
              label: t(`payment.methods.${row.method}`),
              icon: METHOD_ICON[row.method],
              value: row.amountMinor,
              valueLabel: f.money(row.amountMinor, 'EGP', { compact: true }),
              detail: t('units.donations', { count: row.count }),
            }))}
          />
        </section>
        <section className="panel">
          <h2 className="panel-title">{t('admin.charts.byCategory')}</h2>
          <BarList
            label={t('admin.charts.byCategory')}
            items={overview.byCategory.map((row) => ({
              key: row.category,
              label: t(`categories.${row.category}`),
              icon: categoryIcon(row.category),
              value: row.amountMinor,
              valueLabel: f.money(row.amountMinor, 'EGP', { compact: true }),
            }))}
          />
        </section>
      </div>
    </div>
  );
}
