import { Icon, textFor, type IconName } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { href } from '@/lib/i18n';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    title: t('faq.title'),
    description: t('faq.subtitle'),
    alternates: { canonical: `/${locale}/faq`, languages: { ar: '/ar/faq', en: '/en/faq' } },
  };
}

/** The questions, in the order a donor meets them; the answers come from the policies in the project guide (ch. 15). */
const GROUPS = [
  { key: 'donate', icon: 'heart', items: ['how', 'fee', 'paymentFees', 'guest', 'funded'] },
  { key: 'trust', icon: 'shield-check', items: ['verify', 'money', 'photos', 'report'] },
  { key: 'zakat', icon: 'coins', items: ['eligible', 'find', 'ineligible'] },
  { key: 'receipts', icon: 'receipt', items: ['when', 'whyPartner', 'refund', 'canceled'] },
  { key: 'partners', icon: 'hand-heart', items: ['individual', 'join', 'cost'] },
  { key: 'account', icon: 'user', items: ['signIn', 'anonymous', 'data'] },
] as const satisfies ReadonlyArray<{ key: string; icon: IconName; items: readonly string[] }>;

export default async function FaqPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  const qa = (group: string, item: string) => ({
    q: t(`faq.groups.${group}.items.${item}.q` as Parameters<typeof t>[0]),
    a: t(`faq.groups.${group}.items.${item}.a` as Parameters<typeof t>[0]),
  });
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: GROUPS.flatMap(({ key, items }) =>
      items.map((item) => {
        const { q, a } = qa(key, item);
        return { '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } };
      }),
    ),
  };

  return (
    <div className="container-page flex max-w-3xl flex-col gap-8 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold md:text-4xl">{t('faq.title')}</h1>
        <p className="text-muted-foreground">{t('faq.subtitle')}</p>
      </header>

      <nav aria-label={t('faq.title')} className="flex flex-wrap gap-2">
        {GROUPS.map(({ key, icon }) => (
          <a
            key={key}
            href={`#${key}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-semibold hover:border-primary hover:text-primary"
          >
            <Icon name={icon} size={15} />
            {t(`faq.groups.${key}.title`)}
          </a>
        ))}
      </nav>

      {GROUPS.map(({ key, icon, items }) => (
        <section key={key} id={key} aria-labelledby={`${key}-title`} className="flex scroll-mt-24 flex-col gap-3">
          <h2 id={`${key}-title`} className="flex items-center gap-2 font-display text-xl font-bold">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
              <Icon name={icon} size={16} />
            </span>
            {t(`faq.groups.${key}.title`)}
          </h2>
          <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
            {items.map((item) => {
              const { q, a } = qa(key, item);
              return (
                <details key={item} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                    {q}
                    <Icon name="chevron-down" size={18} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="pt-3 leading-[1.9] text-muted-foreground">{a}</p>
                </details>
              );
            })}
          </div>
        </section>
      ))}

      <aside className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-highlight-soft p-5">
        <p className="font-semibold">{t('faq.notFound')}</p>
        <Link href={href(locale, '/contact')} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
          <Icon name="message" size={16} />
          {t('faq.contactLink')}
        </Link>
      </aside>
    </div>
  );
}
