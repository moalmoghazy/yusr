import { brand } from '@yusr/theme';
import { Icon, ScriptLogo, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import type { IconName } from '@yusr/ui';
import { WritingLogo } from '@/components/writing-logo';
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

/** About Yusr: who we are and what we are for, beside the logo writing itself. (The visual-identity section was removed 2026-11-16.) */
export default async function AboutPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return (
    <div className="container-page flex flex-col gap-8 py-10">
      <section aria-labelledby="about-title" className="flex flex-col gap-6 py-2 md:py-6">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex max-w-3xl flex-col gap-4">
            <ScriptLogo label={brand.name[locale]} height={48} className="lg:hidden" />
            <h1 id="about-title" className="font-display text-3xl font-bold leading-[1.4] md:text-4xl">
              {t('about.question')}
            </h1>
            <p className="font-display text-xl font-bold leading-[1.7] text-primary md:text-2xl">{t('about.lead')}</p>
            <p className="text-[1.05rem] leading-[1.9] text-muted-foreground">{t('about.body')}</p>
          </div>
          <div className="hidden justify-center lg:flex">
            <div className="relative grid size-64 place-items-center xl:size-72">
              <svg viewBox="0 0 100 100" aria-hidden focusable="false" className="absolute inset-0 size-full">
                <circle cx="50" cy="50" r="48" className="logo-ring" />
                <circle cx="50" cy="50" r="40" className="logo-ring logo-ring-2" />
              </svg>
              <WritingLogo label={brand.name[locale]} height={96} loop />
            </div>
          </div>
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
    </div>
  );
}
