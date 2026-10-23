import { Icon, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { site } from '@/lib/site';

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    title: t('privacy.title'),
    description: t('privacy.intro'),
    alternates: { canonical: `/${locale}/privacy`, languages: { ar: '/ar/privacy', en: '/en/privacy' } },
  };
}

/** Bump with every material change; the policy promises 14 days' notice before one takes effect. */
const UPDATED = '2026-10-23';

/** The policy in the project guide (15-3), worded for donors and matched to what the site actually does. */
const SECTIONS = [
  { key: 'who', points: ['yusr', 'partner'] },
  { key: 'collect', points: ['donate', 'account', 'auto', 'beneficiaries', 'join'] },
  { key: 'use', points: ['donation', 'safety', 'improve', 'marketing'] },
  { key: 'sensitive', points: ['consent', 'never'] },
  { key: 'share', points: ['partner', 'gateway', 'providers', 'authorities', 'noSale'] },
  { key: 'public', points: ['contact', 'name'] },
  { key: 'cookies', points: ['essential', 'ads'] },
  { key: 'transfer', points: ['cloud'] },
  { key: 'retention', points: ['donations', 'cases', 'account'] },
  { key: 'security', points: ['controls'] },
  { key: 'rights', points: ['list', 'complaint'] },
  { key: 'breach', points: ['notify'] },
  { key: 'changes', points: ['notice', 'contact'] },
] as const;

const MARK = '\u0000';

export default async function PrivacyPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t, f } = textFor(locale);
  const point = (section: string, key: string) => t(`privacy.sections.${section}.points.${key}` as Parameters<typeof t>[0], { email: MARK });
  const email = site.contact.privacyEmail;

  return (
    <div className="container-page grid max-w-5xl grid-cols-1 gap-10 py-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <header className="flex flex-col gap-3 lg:col-span-2">
        <h1 className="font-display text-3xl font-bold md:text-4xl">{t('privacy.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('privacy.updated', { date: f.date(UPDATED, 'long') })}</p>
        <p className="max-w-3xl text-[1.05rem] leading-[1.9]">{t('privacy.intro')}</p>
      </header>

      <nav aria-label={t('privacy.title')} className="hidden lg:block">
        <ol className="sticky top-24 flex flex-col gap-1.5 border-s border-border ps-4 text-sm">
          {SECTIONS.map(({ key }) => (
            <li key={key}>
              <a href={`#${key}`} className="text-muted-foreground hover:text-primary">
                {t(`privacy.sections.${key}.title`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-col gap-8">
        {SECTIONS.map(({ key, points }, index) => (
          <section key={key} id={key} aria-labelledby={`${key}-title`} className="flex scroll-mt-24 flex-col gap-3">
            <h2 id={`${key}-title`} className="flex items-baseline gap-2 font-display text-xl font-bold">
              <span className="text-highlight-soft-foreground tabular-nums">{f.number(index + 1)}.</span>
              {t(`privacy.sections.${key}.title`)}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {points.map((item) => {
                const [before, after] = point(key, item).split(MARK);
                return (
                  <li key={item} className="flex gap-2.5 leading-[1.9] text-muted-foreground">
                    <Icon name="check" size={16} className="mt-1.5 text-primary" />
                    <p>
                      {before}
                      {after !== undefined && (
                        <>
                          <a href={`mailto:${email}`} dir="ltr" className="font-semibold text-primary hover:underline">
                            {email}
                          </a>
                          {after}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
