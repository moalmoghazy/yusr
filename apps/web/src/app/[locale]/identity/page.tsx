import { brand } from '@yusr/theme';
import { textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import { AnimatedMark } from '@/components/animated-mark';
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

/** The visual identity, and nothing else: the mark «الضمّة الذهبية» drawn live, and the pattern «روضة العطاء». */
export default async function IdentityPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return (
    <div className="container-page flex max-w-5xl flex-col gap-8 py-10">
      <h1 className="font-display text-3xl font-bold md:text-4xl">{t('identity.title')}</h1>

      <section aria-labelledby="identity-logo" className="flex flex-col items-center gap-6 rounded-card border border-border bg-card px-4 py-10 md:py-14">
        <h2 id="identity-logo" className="flex flex-col items-center gap-1 text-center">
          <span className="text-sm font-semibold text-muted-foreground">{t('identity.logo')}</span>
          <span className="font-display text-2xl font-bold">{t('identity.logoName')}</span>
        </h2>
        <AnimatedMark label={`${brand.name[locale]} — ${t('identity.logoName')}`} replayLabel={t('identity.replay')} />
      </section>

      <section aria-labelledby="identity-pattern" className="relative overflow-hidden rounded-card border border-border bg-background">
        <div aria-hidden className="bg-brand-pattern absolute inset-0" />
        <div className="relative flex min-h-[22rem] items-end p-6 md:min-h-[28rem]">
          <h2 id="identity-pattern" className="flex flex-col gap-1 rounded-control bg-card/90 px-4 py-3 shadow-sm backdrop-blur-sm">
            <span className="text-sm font-semibold text-muted-foreground">{t('identity.pattern')}</span>
            <span className="font-display text-2xl font-bold">{t('identity.patternName')}</span>
          </h2>
        </div>
      </section>
    </div>
  );
}
