import { textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import { SubmitForm } from '@/components/submit-form';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    title: t('submit.title'),
    description: t('submit.subtitle'),
    alternates: { canonical: `/${locale}/submit`, languages: { ar: '/ar/submit', en: '/en/submit' } },
  };
}

/** The submission portal: who is asking, the case, its documents, then review and send. */
export default async function SubmitPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return (
    <div className="container-page max-w-3xl py-10">
      <header className="mb-8 flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold md:text-4xl">{t('submit.title')}</h1>
        <p className="text-muted-foreground">{t('submit.subtitle')}</p>
      </header>
      <SubmitForm locale={locale} />
    </div>
  );
}
