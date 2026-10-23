import { brand } from '@yusr/theme';
import { Icon, LogoMark, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import { AnimatedMark } from '@/components/animated-mark';
import { StarCloseup } from '@/components/star-closeup';
import type { IconName } from '@yusr/ui';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    title: t('about.title'),
    description: t('about.description'),
    alternates: { canonical: `/${locale}/about`, languages: { ar: '/ar/about', en: '/en/about' } },
  };
}

const VALUES: ReadonlyArray<{ key: 'fair' | 'lasting' | 'open' | 'dignity'; icon: IconName }> = [
  { key: 'fair', icon: 'users' },
  { key: 'lasting', icon: 'heart' },
  { key: 'open', icon: 'receipt' },
  { key: 'dignity', icon: 'hand-heart' },
];

/**
 * About Yusr: who we are and what we are for, then the visual identity — the mark «الضمّة الذهبية»
 * drawn live (its ḍamma follows the pointer) and the pattern «روضة العطاء», each with its story.
 */
export default async function AboutPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return (
    <div className="container-page flex flex-col gap-8 py-10">
      <section aria-labelledby="about-title" className="flex flex-col gap-6 py-2 md:py-6">
        <div className="flex max-w-3xl flex-col gap-4">
          <LogoMark size={40} />
          <h1 id="about-title" className="font-display text-3xl font-bold leading-[1.4] md:text-4xl">
            {t('about.question')}
          </h1>
          <p className="font-display text-xl font-bold leading-[1.7] text-primary md:text-2xl">{t('about.lead')}</p>
          <p className="text-[1.05rem] leading-[1.9] text-muted-foreground">{t('about.body')}</p>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map(({ key, icon }) => (
            <li key={key} className="flex flex-col gap-2 rounded-card border border-border bg-card p-5">
              <span aria-hidden className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
                <Icon name={icon} size={20} />
              </span>
              <h3 className="font-display text-lg font-bold">{t(`about.values.${key}.title`)}</h3>
              <p className="text-sm leading-[1.8] text-muted-foreground">{t(`about.values.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="mt-6 font-display text-2xl font-bold md:text-3xl">{t('identity.title')}</h2>

      <section
        aria-labelledby="identity-logo"
        className="grid grid-cols-1 items-center gap-8 rounded-card border border-border bg-card px-5 py-8 md:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div className="flex flex-col gap-4">
          <h3 id="identity-logo" className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-highlight-soft-foreground">{t('identity.logo')}</span>
            <span className="font-display text-3xl font-bold leading-[1.4]">{t('identity.logoName')}</span>
          </h3>
          <p className="text-[1.05rem] leading-[1.9] text-muted-foreground">{t('identity.logoStory')}</p>
          <p className="flex items-center gap-3 font-display text-xl font-bold text-highlight-soft-foreground">
            <span aria-hidden className="h-px w-10 bg-highlight" />
            {brand.tagline[locale]}
          </p>
        </div>
        <AnimatedMark label={`${brand.name[locale]} — ${t('identity.logoName')}`} replayLabel={t('identity.replay')} />
      </section>

      <section
        aria-labelledby="identity-pattern"
        className="relative grid grid-cols-1 gap-8 overflow-hidden rounded-card border border-border bg-card px-5 pt-8 md:px-10 md:pt-10 lg:min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pb-10"
      >
        <div className="relative z-10 flex flex-col justify-center gap-4">
          <h3 id="identity-pattern" className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-highlight-soft-foreground">{t('identity.pattern')}</span>
            <span className="font-display text-3xl font-bold leading-[1.4]">{t('identity.patternName')}</span>
          </h3>
          <p className="text-[1.05rem] leading-[1.9] text-muted-foreground">{t('identity.patternStory')}</p>
          <figure className="flex flex-col gap-1">
            {/* The verse is always in Arabic; the English page adds a translation beneath it. */}
            <blockquote lang="ar" dir="rtl" className="text-start text-xl leading-[2] text-highlight-soft-foreground">
              {t('identity.verse')}
            </blockquote>
            <figcaption className="text-sm text-muted-foreground">{t('identity.verseSource')}</figcaption>
          </figure>
        </div>
        {/* Bleeds to the card's edge and fades out towards the text: to the side on wide screens, upwards on phones. */}
        <div className="relative -mx-5 h-80 [mask-image:linear-gradient(to_bottom,transparent,black_45%)] md:-mx-10 lg:absolute lg:inset-y-0 lg:end-0 lg:mx-0 lg:h-auto lg:w-1/2 lg:[mask-image:linear-gradient(to_left,black_40%,transparent_95%)] lg:rtl:[mask-image:linear-gradient(to_right,black_40%,transparent_95%)]">
          <StarCloseup label={t('identity.starLabel')} replayLabel={t('identity.replay')} />
        </div>
      </section>
    </div>
  );
}
