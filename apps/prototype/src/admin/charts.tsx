import type { Currency, SeriesPoint } from '@yusr/core';
import { useI18n } from '@yusr/i18n/react';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/icons';
import { cx } from '../ui/primitives';

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Single-series area chart: 2px line, ~10% area wash, hairline grid, crosshair tooltip
 * with keyboard support, endpoint label. Time runs right-to-left in RTL.
 */
export function AreaChart({
  points,
  currency,
  height = 230,
  label,
  tableLabel,
  chartLabel,
}: {
  points: SeriesPoint[];
  currency: Currency;
  height?: number;
  label: string;
  tableLabel: string;
  chartLabel: string;
}) {
  const { f, dir, t } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const width = 720;
  const pad = { top: 16, bottom: 30, start: 64, end: 18 };
  const innerW = width - pad.start - pad.end;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...points.map((point) => point.amountMinor), 1) * 1.08);
  const rtl = dir === 'rtl';

  const xAt = (index: number) => {
    const ratio = points.length <= 1 ? 0 : index / (points.length - 1);
    return rtl ? width - pad.start - ratio * innerW : pad.start + ratio * innerW;
  };
  const yAt = (value: number) => pad.top + innerH - (value / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * max);
  const plotLeft = rtl ? pad.end : pad.start;
  const plotRight = rtl ? width - pad.start : width - pad.end;

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)},${yAt(point.amountMinor).toFixed(1)}`).join(' ');
  const area = `${line} L${xAt(points.length - 1).toFixed(1)},${yAt(0)} L${xAt(0).toFixed(1)},${yAt(0)} Z`;
  const last = points.length - 1;
  const dateLabel = (date: string) => f.date(`${date}T12:00:00`, 'short');

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = rtl ? (width - pad.start - x) / innerW : (x - pad.start) / innerW;
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const forward = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const back = event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (!forward && !back) return;
    event.preventDefault();
    setActive((current) => Math.max(0, Math.min(points.length - 1, (current ?? last) + (forward ? 1 : -1))));
  };

  const activePoint = active !== null ? points[active] : null;
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <div className="chart">
      <div className="chart-toolbar">
        <button type="button" className="link-btn" onClick={() => setTable(!table)} aria-pressed={table}>
          <Icon name={table ? 'activity' : 'list'} size={14} /> {table ? chartLabel : tableLabel}
        </button>
      </div>
      {table ? (
        <div className="table-scroll chart-table">
          <table className="table">
            <thead>
              <tr>
                <th>{t('receipt.date')}</th>
                <th className="num">{t('admin.finance.columns.amount')}</th>
                <th className="num">{t('admin.crm.donationsCount')}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={point.date}>
                  <td>{dateLabel(point.date)}</td>
                  <td className="num">{f.money(point.amountMinor, currency, { fractionDigits: 0 })}</td>
                  <td className="num">{f.number(point.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-plot">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={label}
            tabIndex={0}
            onPointerMove={onPointer}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKey}
            onFocus={() => setActive(last)}
            onBlur={() => setActive(null)}
            className="chart-svg"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.16" />
                <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={plotLeft} x2={plotRight} y1={yAt(tick)} y2={yAt(tick)} className="chart-grid" />
                <text x={rtl ? width - 8 : 8} y={yAt(tick) + 4} className="chart-tick" textAnchor={rtl ? 'end' : 'start'}>
                  {f.money(tick, currency, { compact: true, showCurrency: false })}
                </text>
              </g>
            ))}
            {points.map((point, index) =>
              index % labelEvery === 0 || index === last ? (
                <text key={point.date} x={xAt(index)} y={height - 8} className="chart-tick" textAnchor="middle">
                  {f.date(`${point.date}T12:00:00`, 'short').replace(/\/?\d{4}$|\/?[٠-٩]{4}$/, '')}
                </text>
              ) : null,
            )}
            <path d={area} fill={`url(#${gradientId})`} />
            <path d={line} className="chart-line" />
            {activePoint && active !== null && (
              <g>
                <line x1={xAt(active)} x2={xAt(active)} y1={pad.top} y2={yAt(0)} className="chart-crosshair" />
                <circle cx={xAt(active)} cy={yAt(activePoint.amountMinor)} r="5" className="chart-dot" />
              </g>
            )}
            <circle cx={xAt(last)} cy={yAt(points[last]?.amountMinor ?? 0)} r="4.5" className="chart-dot" />
          </svg>
          {activePoint && active !== null && (
            <div
              className="chart-tooltip"
              style={{ left: `${(xAt(active) / width) * 100}%`, top: `${(yAt(activePoint.amountMinor) / height) * 100}%` }}
              role="status"
            >
              <strong>{f.money(activePoint.amountMinor, currency, { fractionDigits: 0 })}</strong>
              <span>
                <i className="line-key" aria-hidden /> {dateLabel(activePoint.date)} · {t('units.donations', { count: activePoint.count })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface BarItem {
  key: string;
  label: string;
  icon?: IconName;
  value: number;
  valueLabel: string;
  detail?: string;
}

/** Horizontal bars for one series: one color, value at the tip, rounded data-end only. */
export function BarList({ items, label }: { items: BarItem[]; label: string }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="bar-list" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className="bar-row" tabIndex={0} title={`${item.label}: ${item.valueLabel}${item.detail ? ` · ${item.detail}` : ''}`}>
          <span className="bar-label">
            {item.icon && <Icon name={item.icon} size={15} />}
            {item.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </span>
          <span className="bar-value">
            <strong>{item.valueLabel}</strong>
            {item.detail && <small>{item.detail}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const { dir } = useI18n();
  const path = useMemo(() => {
    const max = Math.max(...values, 1);
    const w = 96;
    const h = 28;
    return values
      .map((value, index) => {
        const ratio = values.length <= 1 ? 0 : index / (values.length - 1);
        const x = dir === 'rtl' ? w - ratio * w : ratio * w;
        const y = h - 3 - (value / max) * (h - 6);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values, dir]);
  return (
    <svg viewBox="0 0 96 28" className={cx('sparkline', className)} aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: 'default' | 'gold' | 'warning' | 'primary';
  children?: ReactNode;
}) {
  return (
    <div className={cx('stat-tile', `stat-${tone}`)}>
      <div className="stat-tile-head">
        <span>{label}</span>
        {icon && <Icon name={icon} size={16} />}
      </div>
      <strong className="stat-tile-value">{value}</strong>
      {hint && <span className="stat-tile-hint">{hint}</span>}
      {children}
    </div>
  );
}
