import type { Locale } from '@yusr/core';
import { brand } from '@yusr/theme';
import { Logo, StoreBadge, STORE_GLYPHS, textFor, type StoreName } from '@yusr/ui';
import Link from 'next/link';
import { href } from '@/lib/i18n';

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
          <Link className="text-muted-foreground hover:text-primary" href={`${href(locale)}#transparency`}>
            {t('nav.transparency')}
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
          <span className="text-muted-foreground">{t('footer.faq')}</span>
          <span className="text-muted-foreground">{t('footer.contact')}</span>
          <span className="text-muted-foreground">{t('footer.privacy')}</span>
        </div>
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
