import { brand } from '@yusr/theme';
import { textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import { AnimatedMark } from '@/components/animated-mark';
import { StarCloseup } from '@/components/star-closeup';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    title: t('identity.title'),
    description: t('identity.description'),
    alternates: { canonical: `/${locale}/identity`, languages: { ar: '/ar/identity', en: '/en/identity' } },
  };
}

/** The visual identity: the mark «الضمّة الذهبية» drawn live, and the pattern «روضة العطاء», each with its story. */
export default async function IdentityPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return (
    <div className="container-page flex flex-col gap-8 py-10">
      <h1 className="font-display text-3xl font-bold md:text-4xl">{t('identity.title')}</h1>

      <section
        aria-labelledby="identity-logo"
        className="grid grid-cols-1 items-center gap-8 rounded-card border border-border bg-card px-5 py-8 md:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div className="flex flex-col gap-4">
          <h2 id="identity-logo" className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-highlight-soft-foreground">{t('identity.logo')}</span>
            <span className="font-display text-3xl font-bold leading-[1.4]">{t('identity.logoName')}</span>
          </h2>
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
          <h2 id="identity-pattern" className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-highlight-soft-foreground">{t('identity.pattern')}</span>
            <span className="font-display text-3xl font-bold leading-[1.4]">{t('identity.patternName')}</span>
          </h2>
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
          <StarCloseup label={t('identity.starLabel')} />
        </div>
      </section>
    </div>
  );
}
