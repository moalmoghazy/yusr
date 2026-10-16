import { CATEGORY_META, CURRENCY_META, type CaseSummary, type Locale } from '@yusr/core';
import { useId, type ComponentType, type ReactNode } from 'react';
import { Badge } from './badge';
import { buttonClasses } from './button';
import { RegionLabel } from './case-badges';
import { CaseCover } from './case-cover';
import { cn } from './cn';
import { CountdownBadge } from './countdown';
import { Icon } from './icon';
import { DonationProgress } from './progress';
import { textFor } from './text';

/** The props the card passes to links — Next.js `Link` accepts them as-is. */
export interface CardLinkProps {
  href: string;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export type LinkComponent = ComponentType<CardLinkProps>;

function Anchor(props: CardLinkProps) {
  return <a {...props} />;
}

export interface CaseCardProps {
  item: CaseSummary;
  locale: Locale;
  /** The case page, e.g. `/ar/cases/${item.slug}`. The whole card links there. */
  href: string;
  /**
   * Checkout link, optionally preset to an amount in minor units (piastres, halalas, cents).
   * Defaults to the case page's donate panel: `${href}?amount=5000#donate`.
   */
  donateHref?: (amountMinor?: number) => string;
  /** The app's router link (Next.js `Link`); a plain <a> by default. */
  link?: LinkComponent;
  /** Server time at render, handed to the live countdown so hydration matches. */
  now?: number;
  /** Heading level that fits the page outline (h3 under a section's h2 by default). */
  headingLevel?: 'h2' | 'h3' | 'h4';
  className?: string;
}

/**
 * The donation case card — the platform's most repeated surface.
 *
 * Illustrated cover (never beneficiary photos), trust signals (field-verified, region,
 * reference), honest progress from @yusr/core, and one-tap micro-donations. It renders on
 * the server: every action is a link (the whole card opens the case; quick amounts deep-link
 * into checkout with the amount preset), and only the urgent countdown hydrates on the client.
 *
 * Funded or closed cases trade the donate row for a link to where the money went.
 * Mirrors apps/mobile/src/components/CaseCard.tsx; both read the same data and messages.
 */
export function CaseCard({ item, locale, href, donateHref, link: Link = Anchor, now, headingLevel: Heading = 'h3', className }: CaseCardProps) {
  const { t, f, l } = textFor(locale);
  const titleId = useId();
  const open = item.status === 'published';
  const category = CATEGORY_META[item.category];
  const currency = CURRENCY_META[item.currency];
  const checkout = donateHref ?? ((amountMinor?: number) => `${href}${amountMinor ? `?amount=${amountMinor}` : ''}#donate`);

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'group/card relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground shadow-sm',
        'transition duration-200 ease-standard hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/40',
        className,
      )}
    >
      <div className="relative aspect-video">
        <CaseCover category={item.category} seed={item.coverSeed} className={cn('size-full', !open && 'saturate-[.85]')} />
        <div className="absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-2">
          {item.isUrgent && open ? <CountdownBadge deadline={item.deadline} locale={locale} initialNow={now} /> : <span />}
          {item.verifiedAt && (
            <span className="grid size-[30px] place-items-center rounded-full bg-card text-primary shadow-sm">
              <Icon name="shield-check" size={16} strokeWidth={2} label={t('a11y.verifiedCase')} />
            </span>
          )}
        </div>
        <Badge tone={category.tone} icon={category.icon} className="absolute bottom-2.5 start-2.5 bg-card shadow-sm">
          {t(`categories.${item.category}`)}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 pt-3.5">
        <div className="flex items-center justify-between gap-2 text-[0.8rem] text-muted-foreground">
          <RegionLabel code={item.region} locale={locale} />
          <span className="shrink-0 font-mono text-xs" dir="ltr">
            {item.reference}
          </span>
        </div>

        <Heading id={titleId} className="text-[1.02rem] font-bold leading-relaxed text-foreground">
          {/* The stretched link: its ::after covers the card, so the cover and body open the case too. */}
          <Link href={href} className="outline-none transition-colors after:absolute after:inset-0 hover:text-primary focus-visible:text-primary">
            {l(item.title)}
          </Link>
        </Heading>
        <p className="line-clamp-2 text-[0.87rem] leading-relaxed text-muted-foreground">{l(item.summary)}</p>

        <DonationProgress
          raisedMinor={item.raisedMinor}
          goalMinor={item.goalMinor}
          currency={item.currency}
          locale={locale}
          donors={item.donorsCount}
          size="sm"
        />

        {/* Above the stretched link, so these stay separately clickable. */}
        <div className="relative z-10 mt-auto flex items-center justify-between gap-2 pt-1">
          {open ? (
            <>
              <div role="group" aria-label={t('case.quickDonate')} className="flex gap-1.5">
                {currency.quickAmounts.slice(0, 3).map((amount) => {
                  const minor = amount * 10 ** currency.exponent;
                  return (
                    <Link
                      key={amount}
                      href={checkout(minor)}
                      aria-label={t('case.quickDonateAmount', { amount: f.money(minor, item.currency, { fractionDigits: 0 }) })}
                      aria-describedby={titleId}
                      className={cn(
                        'inline-flex h-[34px] min-w-[46px] items-center justify-center rounded-full border border-border-strong bg-card px-2.5',
                        'text-[0.86rem] font-bold tabular-nums outline-none transition-colors',
                        'hover:border-primary hover:bg-primary-soft hover:text-primary-soft-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      )}
                    >
                      {f.number(amount)}
                    </Link>
                  );
                })}
              </div>
              <Link href={checkout()} aria-describedby={titleId} className={buttonClasses({ size: 'sm' })}>
                <Icon name="heart" size={16} />
                {t('common.donate')}
              </Link>
            </>
          ) : (
            <Link href={`${href}#transparency`} aria-describedby={titleId} className={buttonClasses({ variant: 'soft', size: 'sm', block: true })}>
              <Icon name="receipt" size={16} />
              {t('case.transparency')}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
