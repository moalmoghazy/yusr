import { Icon, PLATFORM_GLYPHS, textFor, type IconName } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { href } from '@/lib/i18n';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { site } from '@/lib/site';

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    title: t('contact.title'),
    description: t('contact.subtitle'),
    alternates: { canonical: `/${locale}/contact`, languages: { ar: '/ar/contact', en: '/en/contact' } },
  };
}

const TOPICS: ReadonlyArray<{ key: 'donation' | 'refund' | 'partner' | 'help' | 'report'; icon: IconName }> = [
  { key: 'donation', icon: 'receipt' },
  { key: 'refund', icon: 'refresh' },
  { key: 'partner', icon: 'hand-heart' },
  { key: 'help', icon: 'life-buoy' },
  { key: 'report', icon: 'alert' },
];

/** WhatsApp shows the number donors already know from the floating button: "+20 100 066 5133". */
function displayPhone(digits: string): string {
  return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

function Channel({ icon, title, body, value, action, link }: { icon: ReactNode; title: string; body: string; value: string; action: string; link: string }) {
  const external = link.startsWith('https:');
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
      <span aria-hidden className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <p className="font-semibold tabular-nums">
        <span dir="ltr">{value}</span>
      </p>
      <a
        href={link}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        {action}
        <Icon name={external ? 'arrow-out' : 'arrow-forward'} size={15} />
      </a>
    </li>
  );
}

/**
 * «تواصل معنا»: the support channels, hours and response times from the project guide (7-9), and
 * where each kind of message should go. The phone and email are settings (see `site.contact`).
 */
export default async function ContactPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  const { phone, email } = site.contact;
  const whatsapp = PLATFORM_GLYPHS.whatsapp;

  return (
    <div className="container-page flex max-w-5xl flex-col gap-10 py-10">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="font-display text-3xl font-bold md:text-4xl">{t('contact.title')}</h1>
        <p className="text-muted-foreground">{t('contact.subtitle')}</p>
      </header>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {site.whatsapp && (
          <Channel
            icon={
              <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden focusable="false">
                <path d={whatsapp.d} />
              </svg>
            }
            title={t('contact.channels.whatsapp.title')}
            body={t('contact.channels.whatsapp.body')}
            value={displayPhone(site.whatsapp)}
            action={t('contact.channels.whatsapp.action')}
            link={`https://wa.me/${site.whatsapp}`}
          />
        )}
        <Channel
          icon={<Icon name="phone" size={20} />}
          title={t('contact.channels.phone.title')}
          body={t('contact.channels.phone.body')}
          value={phone}
          action={t('contact.channels.phone.action')}
          link={`tel:${phone.replace(/[^\d+]/g, '')}`}
        />
        <Channel
          icon={<Icon name="mail" size={20} />}
          title={t('contact.channels.email.title')}
          body={t('contact.channels.email.body')}
          value={email}
          action={t('contact.channels.email.action')}
          link={`mailto:${email}`}
        />
      </ul>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(['hours', 'response'] as const).map((key) => (
          <div key={key} className="flex gap-3 rounded-card border border-border bg-highlight-soft p-5">
            <Icon name={key === 'hours' ? 'clock' : 'message'} size={20} className="mt-0.5 text-highlight-soft-foreground" />
            <div className="flex flex-col gap-1">
              <h2 className="font-bold">{t(`contact.${key}.title`)}</h2>
              <p className="text-sm leading-[1.8] text-muted-foreground">{t(`contact.${key}.body`)}</p>
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="topics-title" className="flex flex-col gap-4">
        <h2 id="topics-title" className="font-display text-2xl font-bold">
          {t('contact.topicsTitle')}
        </h2>
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
          {TOPICS.map(({ key, icon }) => (
            <li key={key} className="flex gap-3 p-5">
              <Icon name={icon} size={20} className="mt-0.5 text-primary" />
              <div className="flex flex-col gap-1">
                <h3 className="font-bold">{t(`contact.topics.${key}.title`)}</h3>
                <p className="text-sm leading-[1.8] text-muted-foreground">{t(`contact.topics.${key}.body`)}</p>
                {key === 'partner' && (
                  <Link href={href(locale, '/join')} className="w-fit text-sm font-semibold text-primary hover:underline">
                    {t('contact.topics.partner.link')}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="lock" size={16} />
          {t('contact.safety')}
        </p>
        <Link href={href(locale, '/faq')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <Icon name="book-open" size={16} />
          {t('contact.faqLink')}
        </Link>
      </div>
    </div>
  );
}
