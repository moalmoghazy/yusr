import type { Locale, PaymentMethod } from '@yusr/core';
import { brand } from '@yusr/theme';
import { Icon, Logo, PaymentMark, StoreBadge, STORE_GLYPHS, textFor, type IconName, type PaymentMarkName, type StoreName } from '@yusr/ui';
import Link from 'next/link';
import { href } from '@/lib/i18n';

/**
 * «الدفع متاح عبر»: each way to pay, with its service's mark. `logo` is the service's own artwork the owner
 * supplied (public/payment-logos, width/height in px at 20px tall, and its corner rounding); `mark` is a
 * drawn @yusr/ui mark. Both are tinted to Yusr's green at rest and show their real colours on hover.
 */
const PAYMENT_METHODS: ReadonlyArray<{
  key: PaymentMethod | 'paymob';
  icon?: IconName;
  mark?: PaymentMarkName;
  logo?: { src: string; width: number; round: string };
}> = [
  { key: 'card', icon: 'credit-card' },
  { key: 'vodafone_cash', logo: { src: '/payment-logos/vodafone.png', width: 20, round: 'rounded-full' } },
  { key: 'instapay', logo: { src: '/payment-logos/instapay.png?v=2', width: 20, round: 'rounded-[5px] ring-1 ring-border' } },
  { key: 'fawry', logo: { src: '/payment-logos/fawry.png', width: 20, round: 'rounded-[5px]' } },
  { key: 'apple_pay', mark: 'apple_pay' },
  { key: 'mada', mark: 'mada' },
  { key: 'paymob', logo: { src: '/payment-logos/paymob.png', width: 20, round: 'rounded-[5px]' } },
];

/** Under the footer's columns, across its whole width: the ways to pay share the row equally. */
function PaymentMethods({ locale }: { locale: Locale }) {
  const { t } = textFor(locale);
  return (
    <section aria-labelledby="pay-with-title" className="flex flex-col gap-3 md:col-span-3">
      <h2 id="pay-with-title" className="font-bold text-foreground">
        {t('footer.payWith')}
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {PAYMENT_METHODS.map(({ key, icon, mark, logo }) => (
          <li
            key={key}
            className="group flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-semibold transition-colors hover:border-primary/30"
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a tiny static logo; next/image adds nothing here
              <img src={logo.src} alt="" width={logo.width} height={20} className={`pay-logo shrink-0 ${logo.round}`} />
            ) : mark ? (
              <PaymentMark name={mark} size={18} />
            ) : (
              <Icon name={icon!} size={17} className="text-primary" />
            )}
            {key === 'paymob' ? t('footer.paymob') : t(`payment.methods.${key}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const { t, f } = textFor(locale);
  return (
    <footer className="mt-24 border-t border-border bg-card">
      <div className="container-page grid grid-cols-1 gap-10 py-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex max-w-sm flex-col gap-3">
          <Logo locale={locale} size={28} />
          <p className="text-sm text-muted-foreground">{t('footer.aboutBody')}</p>
        </div>
        <nav aria-label={t('footer.platform')} className="flex flex-col gap-2 text-sm">
          <h2 className="mb-1 font-bold text-foreground">{t('footer.platform')}</h2>
          <Link className="text-muted-foreground hover:text-primary" href={href(locale, '/cases')}>
            {t('nav.cases')}
          </Link>
          <Link className="text-muted-foreground hover:text-primary" href={`${href(locale)}#how`}>
            {t('nav.howItWorks')}
          </Link>
          <Link className="text-muted-foreground hover:text-primary" href={href(locale, '/submit')}>
            {t('nav.submitCase')}
          </Link>
          <Link className="text-muted-foreground hover:text-primary" href={href(locale, '/about')}>
            {t('nav.about')}
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <h2 className="mb-1 font-bold text-foreground">{t('footer.help')}</h2>
          <Link className="text-muted-foreground hover:text-primary" href={href(locale, '/faq')}>
            {t('footer.faq')}
          </Link>
          <Link className="text-muted-foreground hover:text-primary" href={href(locale, '/privacy')}>
            {t('footer.privacy')}
          </Link>
          <Link className="text-muted-foreground hover:text-primary" href={href(locale, '/contact')}>
            {t('footer.contact')}
          </Link>
        </div>
        <PaymentMethods locale={locale} />
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
          <h2 className="font-bold text-foreground">{t('footer.getApp')}</h2>
          <ul className="flex flex-wrap gap-3">
            {(Object.keys(STORE_GLYPHS) as StoreName[]).map((store) => (
              <li key={store}>
                <StoreBadge
                  store={store}
                  name={t(`footer.stores.${store}`)}
                  caption={t(brand.apps[store] ? 'footer.stores.downloadOn' : 'footer.stores.soonOn')}
                  href={brand.apps[store]}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="container-page py-5 text-xs text-muted-foreground">
          {t('footer.rights', { year: f.number(new Date().getFullYear(), { useGrouping: false }) })}
        </p>
      </div>
    </footer>
  );
}
