import {
  CASE_CATEGORIES,
  CATEGORY_META,
  regionByCode,
  type CaseSummary,
  type LiveDonation,
  type Locale,
  type PlatformStats,
  type PublicPartner,
  type SuccessStory,
} from '@yusr/core';
import {
  buttonClasses,
  CaseCard,
  cn,
  DonationProgress,
  Icon,
  storySlideData,
  storySlideLabels,
  textFor,
  BrushSweep,
  type CaseCardProps,
  type IconName,
} from '@yusr/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FeaturedRotator } from '@/components/featured-rotator';
import { HowReveal } from '@/components/how-reveal';
import { NewsTicker, type NewsItem } from '@/components/news-ticker';
import { StoryReel, type ReelStory } from '@/components/story-reel';
import { SupervisionBadge } from '@/components/supervision-badge';
import { PartnerCardButton, PartnerCardDialog } from '@/components/partner-card';
import { catalog, fresh } from '@/lib/api';
import { href } from '@/lib/i18n';
import { pageLocale, type LocaleParams } from '@/lib/page';

export default async function HomePage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  const api = catalog(locale);
  const [stats, urgent, feed, chosen, stories, partners, settled] = await Promise.all([
    api.stats(),
    api.listCases({ urgentOnly: true, sort: 'urgent', limit: 3 }),
    api.liveDonations(5),
    api.listCases({ featuredOnly: true, limit: 6 }),
    // The two showcase rows are extras: an API that does not serve them yet just hides them.
    // Never cached, like the partners below: what staff publish in «قصص النجاح» in the hub shows at once.
    fresh(locale)
      .successStories(6)
      .catch((): SuccessStory[] => []),
    // Never cached: what staff change in «شركاء الموقع» in the hub shows here on the next visit.
    fresh(locale)
      .partnerShowcase(24)
      .catch((): PublicPartner[] => []),
    // «آخر الأخبار»: recently funded cases (closed ones come with the stories above).
    api.listCases({ includeFunded: true, sort: 'newest', limit: 24 }).catch(() => null),
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
        {/* The ر's long stroke from the logo, written across the hero, with the ḍamma's orange beneath. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <BrushSweep
            writing
            delayMs={300}
            durationMs={1800}
            className="hero-sweep absolute bottom-4 start-[2%] h-36 w-auto text-logo-ink opacity-[0.12] md:h-52"
          />
          <BrushSweep
            writing
            flip
            delayMs={1500}
            durationMs={1400}
            className="absolute top-6 end-[3%] hidden h-20 w-auto text-logo-accent opacity-[0.16] sm:block md:h-28"
          />
        </div>
        <div className="container-page relative grid grid-cols-1 items-center gap-12 lg:items-start py-12 md:py-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="flex flex-col gap-5">
            <SupervisionBadge locale={locale} />
            <h1
              className={cn(
                'font-bold',
                locale === 'en'
                  ? 'font-display text-[clamp(2.05rem,1.2rem+2.6vw,3.3rem)] leading-[1.15]'
                  : 'font-display text-[clamp(2.05rem,1.2rem+2.6vw,3.2rem)] leading-[1.35]',
              )}
            >
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
            <MoneyFlow locale={locale} />
            <LatestNews locale={locale} stories={stories} funded={(settled?.items ?? []).filter((item) => item.status === 'funded')} now={now} />
          </div>
          <LiveBoard locale={locale} feed={feed} featured={featured} now={now} />
        </div>
      </section>

      {partners.length > 0 && <PartnersMarquee locale={locale} partners={partners} />}
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

      {stories.length > 0 && <SuccessStories locale={locale} stories={stories} />}

      <HowItWorks locale={locale} />

      {/* ---------------------------------------------------------------- associations: join as a partner */}
      <section className="container-page pb-6" aria-labelledby="cta-title">
        <div className="relative overflow-hidden rounded-card bg-primary px-6 py-10 text-primary-foreground md:px-10">
          <BrushSweep className="absolute bottom-3 end-[3%] h-24 w-auto text-white opacity-[0.16] md:h-32" />
          <BrushSweep flip className="absolute -top-1 end-[24%] hidden h-14 w-auto text-highlight opacity-40 md:block md:h-16" />
          <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex max-w-xl flex-col gap-2">
              <h2 id="cta-title" className="font-display text-2xl font-bold md:text-3xl">
                {t('landing.ctaTitle')}
              </h2>
              <p className="text-primary-foreground/85">{t('landing.ctaBody')}</p>
            </div>
            <Link href={href(locale, '/join')} className={buttonClasses({ variant: 'gold', size: 'lg' })}>
              <Icon name="hand-heart" size={18} />
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

const FLOW_STEPS = [
  ['heart', 'donor'],
  ['coins', 'fund'],
  ['landmark', 'payee'],
  ['receipt', 'receipt'],
] as const satisfies ReadonlyArray<readonly [IconName, string]>;

/**
 * Where a gift goes, as a row of icons under the hero's buttons: your gift → the partner association's
 * account → the hospital, creditor or school → the payout receipt. The header's «الشفافية» link lands here.
 */
function MoneyFlow({ locale }: { locale: Locale }) {
  const { t } = textFor(locale);
  return (
    <div id="transparency" className="flex scroll-mt-28 flex-col gap-2">
      {/* One row: long labels break onto a second line inside their step (narrow phones may still wrap the row). */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3 sm:flex-nowrap" aria-label={t('landing.transparencyTitle')}>
        {FLOW_STEPS.map(([icon, key], index) => (
          <li key={key} className="inline-flex min-w-0 items-center gap-2">
            <span className="inline-flex max-w-[9.5rem] items-center gap-2 text-sm font-semibold leading-snug text-balance">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
                <Icon name={icon} size={16} />
              </span>
              {t(`landing.flow.${key}`)}
            </span>
            {index < FLOW_STEPS.length - 1 && <Icon name="arrow-forward" size={15} className="text-highlight" />}
          </li>
        ))}
      </ol>
      <p className="inline-flex items-start gap-1.5 text-xs font-semibold text-primary">
        <Icon name="shield-check" size={15} className="mt-px" />
        {t('case.paidDirectly')}
      </p>
    </div>
  );
}

const HOW_STEPS = ['submit', 'verify', 'publish', 'disburse', 'follow'] as const;

/**
 * «من الطلب حتى إثبات الصرف»: the five stages a case passes, shown one after another, with a glowing
 * gold line running from each step to the next (globals.css, `.how-*`). Without motion it is all shown.
 */
function HowItWorks({ locale }: { locale: Locale }) {
  const { t, f } = textFor(locale);
  return (
    <HowReveal labelledBy="how-title" className="container-page scroll-mt-24 py-14">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
        <div className="flex flex-col gap-3 lg:sticky lg:top-28">
          <h2 id="how-title" className="font-display text-3xl font-bold">
            {t('landing.howTitle')}
          </h2>
          <p className="text-muted-foreground">{t('landing.howBody')}</p>
        </div>
        <ol className="flex flex-col rounded-card border border-border bg-card p-5 shadow-sm md:p-6">
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
      </div>
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
        {/* A short stroke of the ر in the ḍamma's orange, under every section title. */}
        <BrushSweep className="-mt-1 h-3.5 w-24 text-highlight" stretch />
        {body && <p className="text-muted-foreground">{body}</p>}
      </div>
      {children}
    </div>
  );
}

/** «قصص نجاح»: the most recently closed cases, with what was raised and when our follow-up confirmed the help arrived. */
function SuccessStories({ locale, stories }: { locale: Locale; stories: SuccessStory[] }) {
  const { t } = textFor(locale);
  return (
    <section className="container-page py-14" aria-labelledby="stories-title">
      <SectionHead id="stories-title" title={t('landing.storiesTitle')} body={t('landing.storiesBody')}>
        <Link href={href(locale, '/cases?includeFunded=true')} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
          {t('common.seeAll')}
          <Icon name="arrow-forward" size={16} />
        </Link>
      </SectionHead>
      <StoryReel
        labels={{ read: t('landing.stories.read'), previous: t('landing.stories.previous'), next: t('landing.stories.next'), ...storySlideLabels(locale) }}
        stories={stories.map((story): ReelStory => ({
          ...storySlideData(story, locale, story.photoVersion ? `/story-photos/${encodeURIComponent(story.id)}?v=${story.photoVersion}` : null),
          id: story.id,
          href: href(locale, `/cases/${story.slug}`),
        }))}
      />
    </section>
  );
}

/** How many items «آخر الأخبار» cycles through. */
const NEWS_ITEMS = 6;

/**
 * «آخر الأخبار» under «شركاء يُسر»: the latest cases that were fully funded or closed (paid out with a
 * receipt), newest first, told as one-line news with how it ended.
 */
function LatestNews({ locale, stories, funded, now }: { locale: Locale; stories: SuccessStory[]; funded: CaseSummary[]; now: number }) {
  const { t, f, l } = textFor(locale);
  const items = [
    ...stories.map((story) => ({ item: story as CaseSummary, at: story.closedAt, headline: t('landing.news.closed', { title: l(story.title) }) })),
    ...funded.filter((item) => item.fundedAt).map((item) => ({ item, at: item.fundedAt!, headline: t('landing.news.funded', { title: l(item.title) }) })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, NEWS_ITEMS)
    .map(({ item, at, headline }): NewsItem => ({
      id: item.id,
      href: href(locale, `/cases/${item.slug}`),
      headline,
      detail: l(item.summary),
      meta: `${regionName(item.region, l)} · ${f.relative(at, now)}`,
    }));
  if (items.length === 0) return null;
  return <NewsTicker items={items} label={t('landing.news.title')} />;
}

/** How many logos one pass of the row holds at least (short lists repeat), so it never runs out. */
const MARQUEE_MIN_ITEMS = 8;

/**
 * «شركاء يُسر» in the hero: the partners' logos, each with its name and its registration number at the
 * Ministry of Social Solidarity, drifting left to right and fading in and out at the edges
 * (globals.css, `.partners-*`). They are muted until the pointer rests on one, which brings back its
 * colours; resting on the row stops it. With reduced motion it is a still row to swipe through.
 */
function PartnersMarquee({ locale, partners }: { locale: Locale; partners: PublicPartner[] }) {
  const { t } = textFor(locale);
  const pass: PublicPartner[] = [];
  while (pass.length < Math.max(MARQUEE_MIN_ITEMS, partners.length)) pass.push(...partners);
  // Two identical passes: moving by exactly one pass, then starting over, looks endless.
  const items = [...pass, ...pass];
  return (
    // A full-width band right above the stats, dressed like them (card background, top rule, page width).
    <section aria-labelledby="partners-title" className="border-t border-border bg-card">
      <div className="container-page flex flex-col gap-4 py-10">
        <div className="flex flex-col gap-1.5">
          <h2 id="partners-title" className="font-display text-[1.9rem] font-bold leading-snug">
            {t('landing.partnersTitle')}
          </h2>
          <p className="max-w-[70ch] text-muted-foreground">{t('landing.partnersBody')}</p>
        </div>
        <div className="partners-marquee" style={{ ['--partners-duration' as string]: `${pass.length * 5.75}s` }}>
          <ul className="partners-track">
            {items.map((partner, index) => (
              // Only the first of each partner is read out; the repeats are for the eye.
              <li
                key={`${partner.id}-${index}`}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                className="partners-item"
                aria-hidden={index >= partners.length || undefined}
                data-repeat={index >= partners.length || undefined}
              >
                <PartnerCardButton partnerId={partner.id} label={t('landing.partners.open', { name: partner.name })} repeat={index >= partners.length}>
                  <span className="relative shrink-0">
                    {partner.isNew && <span className="partners-new">{t('landing.partners.new')}</span>}
                    <span className="partners-logo grid size-21 place-items-center overflow-hidden rounded-[1.4rem] border border-border bg-white">
                      {partner.logoVersion ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a tiny logo from our own route; next/image adds nothing here
                        <img
                          src={`/partner-logos/${encodeURIComponent(partner.id)}?v=${partner.logoVersion}`}
                          alt=""
                          width={84}
                          height={84}
                          loading="lazy"
                          decoding="async"
                          className="size-full object-contain"
                        />
                      ) : (
                        <span aria-hidden className="font-display text-[1.875rem] font-bold text-primary">
                          {initial(partner.name)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="partners-text flex min-w-0 flex-col gap-1">
                    <span className="whitespace-nowrap text-[1.5rem] font-bold leading-snug" dir="auto">
                      {partner.name}
                    </span>
                    <span className="whitespace-nowrap text-[1.125rem] text-muted-foreground">
                      {t('landing.partners.registration')}{' '}
                      <span dir="ltr" className="font-mono">
                        {partner.registrationNumber}
                      </span>
                    </span>
                  </span>
                </PartnerCardButton>
              </li>
            ))}
          </ul>
        </div>
        <PartnerCardDialog locale={locale} partners={partners} />
      </div>
    </section>
  );
}

/** The first letter of an association's own name, past «جمعية» / «مؤسسة» ("Association …"). */
function initial(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/);
  const own = words.find((word, index) => index > 0 || !/^(جمعية|مؤسسة|association|foundation)$/i.test(word)) ?? words[0] ?? '';
  return Array.from(own.replace(/^ال/, ''))[0] ?? '';
}

function regionName(code: string, l: ReturnType<typeof textFor>['l']): string {
  const region = regionByCode(code);
  return region ? l(region.name) : code;
}

function StatsBand({ locale, stats }: { locale: Locale; stats: PlatformStats }) {
  const { t, f } = textFor(locale);
  const items: Array<[IconName, string, string]> = [
    ['coins', f.money(stats.raisedMinor, 'EGP', { compact: true }), t('landing.stats.raised')],
    ['check', f.number(stats.casesFunded), t('landing.stats.funded')],
    ['users', f.number(stats.donors), t('landing.stats.donors')],
    ['map-pin', f.number(stats.regionsCovered), t('landing.stats.regions')],
  ];
  return (
    <section className="border-y border-border bg-card" aria-label={t('landing.stats.raised')}>
      <dl className="container-page grid grid-cols-6 gap-x-4 gap-y-8 py-10 sm:gap-x-6 lg:grid-cols-4">
        {/* Below lg the amount takes the whole first row («مليون ج.م» in KAF FODA sweeps wide), the rest share the next. */}
        {items.map(([icon, value, label], index) => (
          <div key={label} className={cn('flex flex-col gap-1 lg:col-span-1', index === 0 ? 'col-span-6' : 'col-span-2')}>
            <dt className="order-2 inline-flex items-center gap-1.5 text-[0.95rem] text-muted-foreground sm:gap-2 sm:text-lg">
              <Icon name={icon} size={19} className="text-primary" />
              {label}
            </dt>
            <dd className="stat-digits order-1 font-display text-[1.85rem] font-bold leading-tight tabular-nums sm:text-4xl">{value}</dd>
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
          <span aria-hidden className="live-dot size-2 rounded-full bg-logo-ink" />
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
