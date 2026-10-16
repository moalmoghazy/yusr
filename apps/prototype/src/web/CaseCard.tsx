import { CURRENCY_META, type CaseSummary } from '@yusr/core';
import { useL, useT } from '../app/i18n';
import { CaseCover, CategoryBadge, CountdownChip, DonationProgress, RegionLabel } from '../ui/case-ui';
import { Icon } from '../ui/icons';
import { Button, cx } from '../ui/primitives';

export interface CaseCardProps {
  item: CaseSummary;
  onOpen: (slug: string) => void;
  onDonate: (item: CaseSummary, presetMinor?: number) => void;
  variant?: 'grid' | 'rail';
}

/**
 * The donation case card: illustrated cover, trust signals, honest progress
 * and a one-tap micro-donation row. Mirrors packages/ui/src/case-card.tsx (web)
 * and apps/mobile/src/components/CaseCard.tsx (native).
 */
export function CaseCard({ item, onOpen, onDonate, variant = 'grid' }: CaseCardProps) {
  const { t, f } = useT();
  const l = useL();
  const open = item.status === 'published';
  const quick = CURRENCY_META[item.currency].quickAmounts.slice(0, 3);
  const titleId = `case-${item.id}-title`;

  return (
    <article className={cx('case-card', `case-card-${variant}`, !open && 'is-complete')} aria-labelledby={titleId}>
      <button type="button" className="case-card-cover" onClick={() => onOpen(item.slug)} tabIndex={-1} aria-hidden>
        <CaseCover category={item.category} seed={item.coverSeed} />
        <span className="cover-top">
          {item.isUrgent && open ? <CountdownChip deadline={item.deadline} /> : <span />}
          {item.verifiedAt && (
            <span className="cover-verified" title={t('a11y.verifiedCase')}>
              <Icon name="shield-check" size={16} strokeWidth={2} />
            </span>
          )}
        </span>
        <span className="cover-bottom">
          <CategoryBadge category={item.category} />
        </span>
      </button>
      <div className="case-card-body">
        <div className="case-card-meta">
          <RegionLabel code={item.region} />
          <span className="mono ref">{item.reference}</span>
        </div>
        <h3 className="case-card-title" id={titleId}>
          <button type="button" className="title-link" onClick={() => onOpen(item.slug)}>
            {l(item.title)}
          </button>
        </h3>
        <p className="case-card-summary">{l(item.summary)}</p>
        <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} donors={item.donorsCount} size="sm" />
        <div className="case-card-actions">
          {open ? (
            <>
              <div className="quick-amounts" role="group" aria-label={t('case.quickDonate')}>
                {quick.map((amount) => (
                  <button key={amount} type="button" className="quick-amount" onClick={() => onDonate(item, amount * 100)}>
                    {f.number(amount)}
                  </button>
                ))}
              </div>
              <Button size="sm" icon="heart" onClick={() => onDonate(item)}>
                {t('common.donate')}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="soft" icon="receipt" block onClick={() => onOpen(item.slug)}>
              {t('case.transparency')}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
