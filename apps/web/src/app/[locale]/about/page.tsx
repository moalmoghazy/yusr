import { brand, SCRIPT_LOGO_COLORS } from '@yusr/theme';
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

/** «كيف يُكتب»: the logo's letters in writing order, each step lighting its own. */
const WRITING_STEPS = [
  ['ya', ['ya', 'ya-dot-1', 'ya-dot-2']],
  ['seen', ['seen']],
  ['ra', ['ra']],
  ['damma', ['damma']],
] as const;

const VALUES: ReadonlyArray<{ key: 'fair' | 'lasting' | 'open' | 'dignity'; icon: IconName }> = [
  { key: 'fair', icon: 'users' },
  { key: 'lasting', icon: 'heart' },
  { key: 'open', icon: 'receipt' },
  { key: 'dignity', icon: 'hand-heart' },
];

/**
 * About Yusr: who we are and what we are for, then the visual identity — the logo «خطّ اليُسر» writing
 * itself in its own green and orange, its colours and how it is written, and the pattern «روضة العطاء».
 */
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

      <h2 className="mt-6 font-display text-2xl font-bold md:text-3xl">{t('identity.title')}</h2>

      <section
        aria-labelledby="identity-logo"
        className="grid grid-cols-1 items-center gap-8 rounded-card border border-border bg-card px-5 py-8 md:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div className="flex flex-col gap-5">
          <h3 id="identity-logo" className="flex flex-col gap-1">
            <span className="text-sm font-semibold" style={{ color: SCRIPT_LOGO_COLORS.accent.css }}>
              {t('identity.logo')}
            </span>
            <span className="font-display text-3xl font-bold leading-[1.4]">{t('identity.logoName')}</span>
          </h3>
          <p className="text-[1.05rem] leading-[1.9] text-muted-foreground">{t('identity.logoStory')}</p>
          <p className="flex items-center gap-3 font-display text-xl font-bold" style={{ color: SCRIPT_LOGO_COLORS.ink.css }}>
            <span aria-hidden className="h-px w-10" style={{ background: SCRIPT_LOGO_COLORS.accent.css }} />
            {brand.tagline[locale]}
          </p>
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-bold">{t('identity.colors')}</h4>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['ink', t('identity.ink'), t('identity.inkNote')],
                  ['accent', t('identity.accent'), t('identity.accentNote')],
                ] as const
              ).map(([key, name, note]) => (
                <li key={key} className="flex items-center gap-3 rounded-control border border-border p-2.5">
                  <span aria-hidden className="size-10 shrink-0 rounded-control" style={{ background: SCRIPT_LOGO_COLORS[key].css }} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-bold">{name}</span>
                    <span className="text-xs text-muted-foreground">{note}</span>
                    <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                      {SCRIPT_LOGO_COLORS[key].light}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col items-center gap-8">
          <div
            className="grid w-full place-items-center rounded-card py-10"
            style={{ background: `color-mix(in srgb, ${SCRIPT_LOGO_COLORS.ink.css} 7%, transparent)` }}
          >
            <WritingLogo
              label={`${brand.name[locale]} — ${t('identity.logoName')}`}
              height={170}
              delayMs={400}
              replayLabel={t('identity.replay')}
              className="max-w-full"
            />
          </div>
          <div className="flex w-full flex-col gap-3">
            <h4 className="text-sm font-bold">{t('identity.writing')}</h4>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {WRITING_STEPS.map(([key, parts], index) => (
                <li key={key} className="flex flex-col items-center gap-2 rounded-control border border-border p-3 text-center">
                  <ScriptLogo label={t(`identity.steps.${key}`)} height={34} highlight={[...parts]} />
                  <span className="text-xs font-semibold">
                    <span className="me-1 tabular-nums" style={{ color: SCRIPT_LOGO_COLORS.accent.css }}>
                      {index + 1}
                    </span>
                    {t(`identity.steps.${key}`)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
