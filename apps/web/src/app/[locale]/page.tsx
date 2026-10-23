import { CASE_CATEGORIES, CATEGORY_META, methodsForCurrency, type CaseSummary, type LiveDonation, type Locale, type PlatformStats } from '@yusr/core';
import { buttonClasses, CaseCard, cn, DonationProgress, Icon, LogoMark, textFor, type CaseCardProps, type IconName } from '@yusr/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FeaturedRotator } from '@/components/featured-rotator';
import { HowReveal } from '@/components/how-reveal';
import { SupervisionBadge } from '@/components/supervision-badge';
import { catalog } from '@/lib/api';
import { href } from '@/lib/i18n';
import { pageLocale, type LocaleParams } from '@/lib/page';

export default async function HomePage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  const api = catalog(locale);
  const [stats, urgent, feed, chosen] = await Promise.all([
    api.stats(),
    api.listCases({ urgentOnly: true, sort: 'urgent', limit: 3 }),
    api.liveDonations(5),
    api.listCases({ featuredOnly: true, limit: 6 }),
  ]);
  // «يحدث الآن»: the cases moderators chose in the hub (most recently chosen first), else the most urgent one.
  const featured = chosen.items.length
    ? [...chosen.items].sort((a, b) => Date.parse(b.featuredAt ?? '') - Date.parse(a.featuredAt ?? ''))
    : urgent.items.slice(0, 1);
  const now = Date.now();
  const cardProps = (item: CaseSummary): CaseCardProps => ({ item, locale, href: href(locale, `/cases/${item.slug}`), link: Link, now });

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="hero-pattern pointer-events-none absolute inset-0 overflow-hidden">
          <div className="hero-pattern-drift bg-brand-pattern" />
        </div>
        <div className="container-page relative grid grid-cols-1 items-center gap-12 lg:items-start py-12 md:py-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="flex flex-col gap-5">
            <SupervisionBadge locale={locale} />
            <p
              className={cn(
                'inline-flex items-center gap-2 font-semibold text-primary',
                locale === 'en' ? 'text-[0.76rem] uppercase tracking-[0.04em]' : 'text-[0.86rem]',
              )}
            >
              <LogoMark size={20} />
              {t('landing.eyebrow')}
            </p>
            <h1 className={cn('font-display text-[clamp(2.05rem,1.2rem+2.6vw,3.3rem)] font-bold', locale === 'en' ? 'leading-[1.15]' : 'leading-[1.4]')}>
              {t('landing.heroTitle')}
            </h1>
            <p className="max-w-[58ch] text-[1.08rem] text-muted-foreground">{t('landing.heroBody')}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={href(locale, '/cases')} className={buttonClasses({ size: 'lg' })}>
                <Icon name="heart" />
                {t('landing.heroPrimary')}
              </Link>
              <Link href="#how" className={buttonClasses({ variant: 'outline', size: 'lg' })}>
                <Icon name="shield-check" />
                {t('landing.heroSecondary')}
              </Link>
            </div>
            <HowItWorks locale={locale} />
          </div>
          <LiveBoard locale={locale} feed={feed} featured={featured} now={now} />
        </div>
      </section>

      <StatsBand locale={locale} stats={stats} />

      {/* ---------------------------------------------------------------- urgent */}
      {urgent.items.length > 0 && (
        <section className="container-page py-14" aria-labelledby="urgent-title">
          <SectionHead id="urgent-title" title={t('landing.urgentTitle')} body={t('landing.urgentBody')}>
            <Link href={href(locale, '/cases?urgentOnly=true')} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
              {t('common.seeAll')}
              <Icon name="arrow-forward" size={16} />
            </Link>
          </SectionHead>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {urgent.items.map((item) => (
              <CaseCard key={item.id} {...cardProps(item)} />
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- categories */}
      <section className="container-page py-6" aria-labelledby="categories-title">
        <SectionHead id="categories-title" title={t('landing.categoriesTitle')} />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CASE_CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                href={href(locale, `/cases?categories=${category}`)}
                className="group flex h-full flex-col gap-3 rounded-card border border-border bg-card p-4 outline-none transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className={cn('grid size-11 place-items-center rounded-xl', CATEGORY_TILE[CATEGORY_META[category].tone])}>
                  <Icon name={CATEGORY_META[category].icon} size={22} />
                </span>
                <span className="font-bold group-hover:text-primary">{t(`categories.${category}`)}</span>
                <span className="text-sm text-muted-foreground">{t(`categoryDescriptions.${category}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- transparency */}
      <section id="transparency" className="border-y border-border bg-card" aria-labelledby="transparency-title">
        <div className="container-page grid grid-cols-1 items-center gap-10 py-14 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 id="transparency-title" className="font-display text-3xl font-bold">
              {t('landing.transparencyTitle')}
            </h2>
            <p className="text-muted-foreground">{t('landing.transparencyBody')}</p>
            <p className="inline-flex items-start gap-2 text-sm font-semibold text-primary">
              <Icon name="shield-check" size={18} className="mt-0.5" />
              {t('case.paidDirectly')}
            </p>
          </div>
          <ol className="flex flex-col gap-3" aria-label={t('landing.transparencyTitle')}>
            {(
              [
                ['heart', t('landing.flow.donor')],
                ['coins', t('landing.flow.fund')],
                ['landmark', t('landing.flow.payee')],
                ['receipt', t('landing.flow.receipt')],
              ] as const
            ).map(([icon, text], index, all) => (
              <li key={icon} className="flex flex-col items-start gap-3">
                <span className="inline-flex items-center gap-3 rounded-full border border-border bg-background px-4 py-2.5 font-semibold shadow-sm">
                  <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
                    <Icon name={icon} size={17} />
                  </span>
                  {text}
                </span>
                {index < all.length - 1 && <Icon name="chevron-down" size={18} className="ms-6 text-highlight" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- payments */}
      <section className="container-page py-14" aria-labelledby="payments-title">
        <SectionHead id="payments-title" title={t('landing.paymentsTitle')} body={t('landing.paymentsBody')} />
        <ul className="flex flex-wrap gap-2">
          {[...new Set([...methodsForCurrency('EGP'), ...methodsForCurrency('SAR'), ...methodsForCurrency('USD')])].map((method) => (
            <li key={method} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold">
              <Icon name={METHOD_ICON[method] ?? 'credit-card'} size={16} className="text-primary" />
              {t(`payment.methods.${method}`)}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- submit a case */}
      <section className="container-page pb-6" aria-labelledby="cta-title">
        <div className="relative overflow-hidden rounded-card bg-primary px-6 py-10 text-primary-foreground md:px-10">
          <div
            className="bg-brand-pattern pointer-events-none absolute inset-0 opacity-25 [mask-image:linear-gradient(to_left,black,transparent_70%)] rtl:[mask-image:linear-gradient(to_right,black,transparent_70%)]"
            aria-hidden
          />
          <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex max-w-xl flex-col gap-2">
              <h2 id="cta-title" className="font-display text-2xl font-bold md:text-3xl">
                {t('landing.ctaTitle')}
              </h2>
              <p className="text-primary-foreground/85">{t('landing.ctaBody')}</p>
            </div>
            <Link href={href(locale, '/submit')} className={buttonClasses({ variant: 'gold', size: 'lg' })}>
              <Icon name="plus" size={18} />
              {t('landing.ctaButton')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

const CATEGORY_TILE = {
  rose: 'bg-tone-rose-soft text-tone-rose-soft-foreground',
  slate: 'bg-tone-slate-soft text-tone-slate-soft-foreground',
  sky: 'bg-tone-sky-soft text-tone-sky-soft-foreground',
  gold: 'bg-tone-gold-soft text-tone-gold-soft-foreground',
  teal: 'bg-tone-teal-soft text-tone-teal-soft-foreground',
} as const;

const METHOD_ICON: Partial<Record<string, IconName>> = {
  card: 'credit-card',
  apple_pay: 'smartphone',
  mada: 'credit-card',
  vodafone_cash: 'wallet',
  fawry: 'store',
  instapay: 'landmark',
};

const HOW_STEPS = ['submit', 'verify', 'publish', 'disburse'] as const;

/**
 * «كيف نعمل» inside the hero: the four stages a case passes, shown one after another, with a glowing
 * gold line running from each step to the next (globals.css, `.how-*`). Without motion it is all shown.
 */
function HowItWorks({ locale }: { locale: Locale }) {
  const { t, f } = textFor(locale);
  return (
    <HowReveal
      labelledBy="how-title"
      className="scroll-mt-24 flex flex-col gap-4 rounded-card border border-border/70 bg-card/75 p-5 shadow-sm backdrop-blur-sm"
    >
      <div className="flex flex-col gap-1">
        <h2 id="how-title" className="font-display text-lg font-bold">
          {t('landing.howTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('landing.howBody')}</p>
      </div>
      <ol className="flex flex-col">
        {HOW_STEPS.map((step, index) => (
          <li key={step} className="how-step relative flex gap-3 pb-5 last:pb-0" style={{ ['--step' as string]: index }}>
            <span className="how-dot relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">
              {f.number(index + 1)}
            </span>
            {index < HOW_STEPS.length - 1 && (
              <span aria-hidden className="how-line">
                <span className="how-line-fill" />
              </span>
            )}
            <div className="flex flex-col gap-0.5 pt-1.5">
              <h3 className="font-bold leading-snug">{t(`landing.howSteps.${step}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`landing.howSteps.${step}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>
    </HowReveal>
  );
}

function SectionHead({ id, title, body, children }: { id: string; title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h2 id={id} className="font-display text-[1.9rem] font-bold leading-snug">
          {title}
        </h2>
        {body && <p className="text-muted-foreground">{body}</p>}
      </div>
      {children}
    </div>
  );
}

function StatsBand({ locale, stats }: { locale: Locale; stats: PlatformStats }) {
  const { t, f } = textFor(locale);
  const items: Array<[IconName, string, string]> = [
    ['coins', f.money(stats.raisedMinor, 'EGP', { compact: true }), t('landing.stats.raised')],
    ['check', f.number(stats.casesFunded), t('landing.stats.funded')],
    ['users', f.number(stats.donors), t('landing.stats.donors')],
    ['map-pin', f.number(stats.regionsCovered), t('landing.stats.regions')],
    ['clock', f.number(stats.medianHoursToFund), t('landing.stats.hoursToFund')],
  ];
  return (
    <section className="border-y border-border bg-card" aria-label={t('landing.stats.raised')}>
      <dl className="container-page grid grid-cols-2 gap-6 py-8 sm:grid-cols-3 lg:grid-cols-5">
        {items.map(([icon, value, label]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="order-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon name={icon} size={15} className="text-primary" />
              {label}
            </dt>
            <dd className="order-1 font-display text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Latest gifts across the platform (anonymous donors stay «فاعل خير») and the most urgent case. */
function LiveBoard({ locale, feed, featured, now }: { locale: Locale; feed: LiveDonation[]; featured: CaseSummary[]; now: number }) {
  const { t, f, l } = textFor(locale);
  return (
    <aside aria-labelledby="live-title" className="rounded-[1.4rem] border border-border bg-card p-5 shadow-lg">
      <header className="mb-3 flex items-center justify-between">
        <h2 id="live-title" className="inline-flex items-center gap-2 font-bold">
          <span aria-hidden className="size-2 rounded-full bg-success motion-safe:animate-pulse" />
          {t('landing.liveTitle')}
        </h2>
        <span className="text-xs text-muted-foreground">{t('common.live')}</span>
      </header>
      <ol className="flex flex-col">
        {feed.map((gift) => {
          const name = gift.displayName ? l(gift.displayName) : t('case.anonymous');
          return (
            <li key={gift.id} className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-foreground"
              >
                {gift.displayName ? name.trim().charAt(0) : <Icon name="heart" size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {t('landing.liveDonation', { name, amount: f.money(gift.amountMinor, gift.currency, { fractionDigits: 0 }) })}
                </p>
                <Link href={href(locale, `/cases/${gift.caseSlug}`)} className="block truncate text-xs text-muted-foreground hover:text-primary">
                  {t('landing.liveTo', { title: l(gift.caseTitle) })}
                </Link>
              </div>
              <time dateTime={gift.at} className="shrink-0 text-xs text-muted-foreground">
                {f.relative(gift.at, now)}
              </time>
            </li>
          );
        })}
      </ol>
      {featured.length > 0 && (
        <div className="mt-4">
          <FeaturedRotator labels={featured.map((item) => l(item.title))}>
            {featured.map((item) => (
              <div key={item.id} className="flex h-full flex-col gap-3 rounded-card bg-muted/60 p-4">
                {item.isUrgent && <p className="text-xs font-bold text-destructive">{t('case.urgent')}</p>}
                <Link href={href(locale, `/cases/${item.slug}`)} className="font-bold hover:text-primary">
                  {l(item.title)}
                </Link>
                <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} locale={locale} size="sm" />
                <Link href={href(locale, `/cases/${item.slug}#donate`)} className={buttonClasses({ block: true, className: 'mt-auto' })}>
                  <Icon name="heart" size={17} />
                  {t('case.donateCta')}
                </Link>
              </div>
            ))}
          </FeaturedRotator>
        </div>
      )}
    </aside>
  );
}
