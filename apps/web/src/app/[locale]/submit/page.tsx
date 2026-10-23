import { textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import { DEMO_PARTNER_REGISTRY } from '@yusr/sdk/mock';
import { SubmitForm } from '@/components/submit-form';
import Link from 'next/link';
import { href } from '@/lib/i18n';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { site } from '@/lib/site';

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
        <p className="text-sm">
          {t('submit.notPartnerYet')}{' '}
          <Link href={href(locale, '/join')} className="font-semibold text-primary hover:underline">
            {t('landing.ctaButton')}
          </Link>
        </p>
      </header>
      {/* A public demo offers a demo partner's registration number and «كود يُسر» (never a real one). */}
      <SubmitForm locale={locale} demoPartner={site.demo ? (DEMO_PARTNER_REGISTRY[0] ?? null) : null} />
    </div>
  );
}
