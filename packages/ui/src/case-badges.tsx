import { CATEGORY_META, regionByCode, type CaseCategory, type CaseStatus, type Locale } from '@yusr/core';
import { Badge, type BadgeTone } from './badge';
import { cn } from './cn';
import { Icon } from './icon';
import { textFor } from './text';

export function CategoryBadge({ category, locale, className }: { category: CaseCategory; locale: Locale; className?: string }) {
  const meta = CATEGORY_META[category];
  return (
    <Badge tone={meta.tone} icon={meta.icon} className={className}>
      {textFor(locale).t(`categories.${category}`)}
    </Badge>
  );
}

const STATUS_TONE: Readonly<Record<CaseStatus, BadgeTone>> = {
  draft: 'neutral',
  under_review: 'info',
  field_verified: 'teal',
  published: 'primary',
  funded: 'gold',
  closed: 'slate',
  paused: 'warning',
  rejected: 'urgent',
};

/** A case's place in the pipeline (draft → … → closed), as the control hub shows it. */
export function StatusBadge({ status, locale, className }: { status: CaseStatus; locale: Locale; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      {textFor(locale).t(`status.${status}`)}
    </Badge>
  );
}

export function VerifiedBadge({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <Badge tone="primary" icon="shield-check" className={className}>
      {textFor(locale).t('case.verified')}
    </Badge>
  );
}

export function ZakatBadge({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <Badge tone="gold" icon="coins" className={className}>
      {textFor(locale).t('case.zakatEligible')}
    </Badge>
  );
}

/** Governorate / region name from its ISO 3166-2 code, with a map pin. */
export function RegionLabel({ code, locale, withIcon = true, className }: { code: string; locale: Locale; withIcon?: boolean; className?: string }) {
  const { t, l } = textFor(locale);
  const region = regionByCode(code);
  const name = region ? l(region.name) : code === 'INT' ? t('common.international') : code;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      {withIcon && <Icon name="map-pin" size={14} />}
      <span className="truncate">{name}</span>
    </span>
  );
}
