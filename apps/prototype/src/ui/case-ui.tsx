import { CATEGORY_META, computeCountdown, computeProgress, regionByCode, type CaseCategory, type CaseStatus, type Currency } from '@yusr/core';
import { useI18n } from '@yusr/i18n/react';
import { useNow } from '../app/clock';
import { Icon, type IconName } from './icons';
import { PatternDefs } from './pattern';
import { Badge, cx, useAnimatedNumber, type Tone } from './primitives';

/** A category's icon — the one @yusr/core assigns, shared with the website and the app. */
export const categoryIcon = (category: CaseCategory): IconName => CATEGORY_META[category].icon;

export function CategoryBadge({ category }: { category: CaseCategory }) {
  const { t } = useI18n<string>();
  return (
    <Badge tone={CATEGORY_META[category].tone} icon={categoryIcon(category)}>
      {t(`categories.${category}`)}
    </Badge>
  );
}

export function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Badge tone="primary" icon="shield-check" title={t('a11y.verifiedCase')}>
      {compact ? t('case.verified').split(' ')[0] : t('case.verified')}
    </Badge>
  );
}

export function ZakatBadge() {
  const { t } = useI18n();
  return (
    <Badge tone="gold" icon="coins">
      {t('case.zakatEligible')}
    </Badge>
  );
}

const STATUS_TONE: Record<CaseStatus, Tone> = {
  draft: 'neutral',
  under_review: 'info',
  field_verified: 'teal',
  published: 'primary',
  funded: 'gold',
  closed: 'slate',
  paused: 'warning',
  rejected: 'urgent',
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const { t } = useI18n<string>();
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

export function RegionLabel({ code, withIcon = true }: { code: string; withIcon?: boolean }) {
  const { locale } = useI18n();
  const region = regionByCode(code);
  const name = region?.name[locale] ?? (code === 'INT' ? (locale === 'ar' ? 'خارج المنطقة' : 'International') : code);
  return (
    <span className="region-label">
      {withIcon && <Icon name="map-pin" size={14} />}
      {name}
    </span>
  );
}

export function Money({ minor, currency, compact, className }: { minor: number; currency: Currency; compact?: boolean; className?: string }) {
  const { f } = useI18n();
  return <span className={cx('money', className)}>{f.money(minor, currency, { compact })}</span>;
}

/**
 * Progress toward the goal. The leading edge carries the brand's golden ḍamma;
 * funded cases turn the bar gold. Honest rounding comes from @yusr/core.
 */
export function DonationProgress({
  raisedMinor,
  goalMinor,
  currency,
  size = 'md',
  showAmounts = true,
  donors,
}: {
  raisedMinor: number;
  goalMinor: number;
  currency: Currency;
  size?: 'sm' | 'md' | 'lg';
  showAmounts?: boolean;
  donors?: number;
}) {
  const { t, f } = useI18n();
  const progress = computeProgress(raisedMinor, goalMinor);
  const animated = useAnimatedNumber(progress.ratio * 100);
  const label = t('a11y.progress', { percent: f.percent(progress.percent) });
  return (
    <div className={cx('progress', `progress-${size}`, `progress-${progress.tone}`)}>
      {showAmounts && (
        <div className="progress-head">
          <span className="progress-raised">
            <strong>{f.money(raisedMinor, currency, { fractionDigits: 0 })}</strong>
            <span className="progress-goal">
              {t('common.of')} {f.money(goalMinor, currency, { fractionDigits: 0 })}
            </span>
          </span>
          <span className="progress-percent">{f.percent(progress.percent)}</span>
        </div>
      )}
      <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
        <span className="progress-fill" style={{ width: `${Math.max(animated, progress.ratio > 0 ? 1.5 : 0)}%` }}>
          {progress.ratio > 0 && <span className="progress-dot" />}
        </span>
      </div>
      {showAmounts && (
        <div className="progress-foot">
          {donors !== undefined && (
            <span>
              <Icon name="users" size={14} /> {t('units.donors', { count: donors })}
            </span>
          )}
          <span>
            {progress.isFunded ? (
              <strong className="text-gold">{t('case.fundedBadge')}</strong>
            ) : (
              <>
                {t('case.remaining')} <strong>{f.money(progress.remainingMinor, currency, { fractionDigits: 0 })}</strong>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export function CountdownChip({ deadline }: { deadline: string | null }) {
  const { t, f } = useI18n();
  const now = useNow();
  const countdown = computeCountdown(deadline, now);
  if (!countdown) return null;
  if (countdown.expired)
    return (
      <Badge tone="neutral" icon="clock">
        {t('case.ended')}
      </Badge>
    );
  const pad = (value: number) => f.number(value, { minimumIntegerDigits: 2, useGrouping: false });
  const localized =
    countdown.days > 0 ? t('units.daysLeft', { count: countdown.days }) : `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`;
  return (
    <span className={cx('countdown-chip', `urgency-${countdown.level}`)} aria-label={`${t('a11y.countdown')}: ${localized}`}>
      <span className="pulse-dot" aria-hidden />
      <Icon name="clock" size={14} strokeWidth={2} />
      <span className="countdown-text">{localized}</span>
    </span>
  );
}

export function CountdownBlocks({ deadline }: { deadline: string | null }) {
  const { t, f } = useI18n();
  const now = useNow();
  const countdown = computeCountdown(deadline, now);
  if (!countdown) return null;
  const parts: Array<[number, string]> = [
    [countdown.days, t('time.days')],
    [countdown.hours, t('time.hours')],
    [countdown.minutes, t('time.minutes')],
    [countdown.seconds, t('time.seconds')],
  ];
  return (
    <div className={cx('countdown-blocks', `urgency-${countdown.level}`)} role="timer" aria-label={t('a11y.countdown')}>
      <span className="countdown-title">
        <Icon name="clock" size={15} /> {countdown.expired ? t('case.ended') : t('case.endsIn')}
      </span>
      <div className="countdown-cells">
        {parts.map(([value, unit]) => (
          <span className="countdown-cell" key={unit}>
            <strong>{f.number(value, { minimumIntegerDigits: 2 })}</strong>
            <small>{unit}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Illustrated cover — no beneficiary photos by design. Each category has a motif,
 * placed on the brand's Andalusian lattice; the seed varies composition per case.
 */
export function CaseCover({ category, seed, className, label }: { category: CaseCategory; seed: number; className?: string; label?: string }) {
  const tone = CATEGORY_META[category].tone;
  const variant = seed % 4;
  const cx1 = 60 + (seed % 7) * 26;
  const cy1 = 40 + (seed % 5) * 22;
  const patternId = `lattice-${category}-${seed}`;
  return (
    <svg
      className={cx('case-cover', `tone-${tone}`, className)}
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <PatternDefs id={patternId} transform={`translate(${(seed * 13) % 64} ${(seed * 7) % 64})`} />
      </defs>
      <rect width="320" height="180" className="cover-bg" />
      <rect width="320" height="180" fill={`url(#${patternId})`} className="cover-lattice" />
      <circle cx={cx1} cy={cy1} r={70 + variant * 12} className="cover-orb" />
      <circle cx={320 - cx1 / 2} cy={170 - cy1 / 3} r={36 + variant * 6} className="cover-orb cover-orb-2" />
      <g transform={`translate(${variant % 2 === 0 ? 196 : 76} ${44 + (seed % 3) * 6}) scale(3.4)`} className="cover-glyph">
        <CoverGlyph category={category} />
      </g>
      <circle cx={variant % 2 === 0 ? 262 : 142} cy={48 + (seed % 3) * 6} r="5.5" className="cover-damma" />
    </svg>
  );
}

function CoverGlyph({ category }: { category: CaseCategory }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (category) {
    case 'medical':
      return (
        <g {...common}>
          <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />
          <path d="M3.4 12H8l1.5-3 3 6 1.5-3h6.2" />
        </g>
      );
    case 'debt_relief':
      return (
        <g {...common}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 7.7-1.5" />
          <path d="M12 15v2" />
        </g>
      );
    case 'education':
      return (
        <g {...common}>
          <path d="M22 10 12 5 2 10l10 5 10-5Z" />
          <path d="M6 12v5c3 2 9 2 12 0v-5" />
          <path d="M22 10v6" />
        </g>
      );
    case 'orphans':
      return (
        <g {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9v12h14V9" />
          <path d="M12 18s-3-1.9-3-4a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 2.1-3 4-3 4Z" />
        </g>
      );
    case 'relief':
      return (
        <g {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M14.8 9.2l3.6-3.6M5.6 18.4l3.6-3.6" />
        </g>
      );
  }
}
