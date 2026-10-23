import { Icon, textFor, type IconName } from '@yusr/ui';
import type { Metadata } from 'next';
import { JoinForm } from '@/components/join-form';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    title: t('join.title'),
    description: t('join.subtitle'),
    alternates: { canonical: `/${locale}/join`, languages: { ar: '/ar/join', en: '/en/join' } },
  };
}

const STEPS: ReadonlyArray<{ key: 'apply' | 'call' | 'contract' | 'code'; icon: IconName }> = [
  { key: 'apply', icon: 'send' },
  { key: 'call', icon: 'phone' },
  { key: 'contract', icon: 'file-text' },
  { key: 'code', icon: 'shield-check' },
];

/**
 * For associations that are not partners yet: how joining works, then the request form. Partners
 * already in the registry submit cases from /submit with their «كود يُسر».
 */
export default async function JoinPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return (
    <div className="container-page grid max-w-5xl grid-cols-1 gap-8 py-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-bold md:text-4xl">{t('join.title')}</h1>
          <p className="text-muted-foreground">{t('join.subtitle')}</p>
        </div>
        <ol className="flex flex-col gap-3">
          {STEPS.map(({ key, icon }) => (
            <li key={key} className="flex gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
                <Icon name={icon} size={18} />
              </span>
              <div className="flex flex-col gap-0.5">
                <h2 className="font-bold">{t(`join.steps.${key}.title`)}</h2>
                <p className="text-sm text-muted-foreground">{t(`join.steps.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </header>
      <JoinForm locale={locale} />
    </div>
  );
}
