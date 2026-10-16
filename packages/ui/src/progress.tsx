import { computeProgress, type Currency, type Locale } from '@yusr/core';
import { cn } from './cn';
import { Icon } from './icon';
import { textFor } from './text';

const TRACK = { sm: 'h-[7px]', md: 'h-2', lg: 'h-3' } as const;
const DOT = { sm: 'size-3', md: 'size-[13px]', lg: 'size-[17px]' } as const;

export type ProgressSize = keyof typeof TRACK;

export interface ProgressBarProps {
  /** 0–100. */
  value: number;
  /** Accessible name, e.g. «تم جمع ٧٦٪ من الهدف». */
  label: string;
  size?: ProgressSize;
  /** `complete` turns the bar gold and drops the leading dot. */
  complete?: boolean;
  className?: string;
}

/**
 * The bar itself. The leading edge carries the logo's golden ḍamma; a bar with any progress
 * shows at least a sliver so a first donation is visible. The fill grows from the inline
 * start, so it runs right-to-left in Arabic with no extra rules.
 */
export function ProgressBar({ value, label, size = 'md', complete = false, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const width = clamped > 0 ? Math.max(clamped, 1.5) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('relative w-full rounded-full bg-muted', TRACK[size], className)}
    >
      <span
        className={cn(
          'relative block h-full rounded-full transition-[width] duration-700 ease-emphasized motion-reduce:transition-none',
          complete ? 'bg-highlight' : 'bg-primary',
        )}
        style={{ width: `${width}%` }}
      >
        {width > 0 && !complete && (
          <span className={cn('absolute top-1/2 -end-1.5 -translate-y-1/2 rounded-full bg-highlight ring-[3px] ring-card', DOT[size])} />
        )}
      </span>
    </div>
  );
}

export interface DonationProgressProps {
  raisedMinor: number;
  goalMinor: number;
  currency: Currency;
  locale: Locale;
  /** Shows «٢١٤ متبرعًا» in the footer when given. */
  donors?: number;
  size?: ProgressSize;
  /** `false` renders the bar alone (compact rows, tables). */
  showAmounts?: boolean;
  className?: string;
}

/**
 * Raised / goal / remaining with the bar between them. The percentage follows @yusr/core's
 * honesty rules: a case with donations never reads 0%, a case short of its goal never reads 100%.
 * Renders on the server (no state, no effects).
 */
export function DonationProgress({ raisedMinor, goalMinor, currency, locale, donors, size = 'md', showAmounts = true, className }: DonationProgressProps) {
  const { t, f } = textFor(locale);
  const progress = computeProgress(raisedMinor, goalMinor);
  const percent = f.percent(progress.percent);
  // The honest percentage drives both the width and what assistive tech announces, so they never disagree.
  const bar = <ProgressBar value={progress.percent} label={t('a11y.progress', { percent })} size={size} complete={progress.isFunded} />;
  if (!showAmounts) return <div className={className}>{bar}</div>;

  return (
    <div className={cn('flex flex-col gap-2 tabular-nums', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0">
          <strong className={cn('font-bold text-foreground', size === 'lg' ? 'text-2xl' : 'text-base')}>
            {f.money(raisedMinor, currency, { fractionDigits: 0 })}
          </strong>
          <span className="ms-1.5 text-[0.82rem] text-muted-foreground">
            {t('common.of')} {f.money(goalMinor, currency, { fractionDigits: 0 })}
          </span>
        </span>
        <span className={cn('font-bold', size === 'lg' ? 'text-lg' : 'text-[0.92rem]', progress.isFunded ? 'text-highlight-soft-foreground' : 'text-primary')}>
          {percent}
        </span>
      </div>
      {bar}
      <div className="flex items-center justify-between gap-2 text-[0.8rem] text-muted-foreground">
        {donors !== undefined ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="users" size={14} />
            {t('units.donors', { count: donors })}
          </span>
        ) : (
          <span />
        )}
        <span>
          {progress.isFunded ? (
            <strong className="font-bold text-highlight-soft-foreground">{t('case.fundedBadge')}</strong>
          ) : (
            <>
              {t('case.remaining')}{' '}
              <strong className="font-semibold text-foreground">{f.money(progress.remainingMinor, currency, { fractionDigits: 0 })}</strong>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
