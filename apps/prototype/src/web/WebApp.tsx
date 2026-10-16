import type { CaseSummary } from '@yusr/core';
import { createContext, useCallback, useContext, useState } from 'react';
import { useT } from '../app/i18n';
import { usePrototype, type WebPage } from '../app/prefs';
import { Logo } from '../ui/brand';
import { Icon } from '../ui/icons';
import { Button, IconButton, cx } from '../ui/primitives';
import { CaseDetailPage } from './CaseDetail';
import { CatalogPage } from './Catalog';
import { DonateDialog } from './DonateFlow';
import { LandingPage } from './Landing';
import { PortalPage } from './Portal';
import { SubmitPage } from './Submit';

interface DonateTarget {
  item: CaseSummary;
  presetMinor?: number;
}

const DonateContext = createContext<(item: CaseSummary, presetMinor?: number) => void>(() => undefined);

export function useDonate() {
  return useContext(DonateContext);
}

export function WebApp() {
  const { web } = usePrototype();
  const [target, setTarget] = useState<DonateTarget | null>(null);
  const openDonate = useCallback((item: CaseSummary, presetMinor?: number) => setTarget({ item, presetMinor }), []);

  return (
    <DonateContext.Provider value={openDonate}>
      <div className="site">
        <SiteHeader />
        <div className="site-main" key={`${web.page}:${web.slug ?? ''}`}>
          {web.page === 'home' && <LandingPage />}
          {web.page === 'cases' && <CatalogPage />}
          {web.page === 'case' && web.slug && <CaseDetailPage slug={web.slug} initialTab={web.tab} />}
          {web.page === 'account' && <PortalPage />}
          {web.page === 'submit' && <SubmitPage />}
        </div>
        <SiteFooter />
      </div>
      {target && <DonateDialog item={target.item} presetMinor={target.presetMinor} onClose={() => setTarget(null)} />}
    </DonateContext.Provider>
  );
}

function SiteHeader() {
  const { t } = useT();
  const { web, goWeb, locale, setLocale } = usePrototype();
  const [menu, setMenu] = useState(false);
  const links: Array<{ page: WebPage; label: string }> = [
    { page: 'home', label: t('nav.home') },
    { page: 'cases', label: t('nav.cases') },
    { page: 'submit', label: t('nav.submitCase') },
  ];
  const go = (page: WebPage) => {
    setMenu(false);
    goWeb({ page });
  };
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <button type="button" className="brand-link" onClick={() => go('home')} aria-label={t('nav.home')}>
          <Logo size={30} />
        </button>
        <nav className={cx('site-nav', menu && 'is-open')} aria-label={t('nav.menu')}>
          {links.map((link) => (
            <button
              key={link.page}
              type="button"
              className={cx('nav-link', web.page === link.page && 'is-active')}
              aria-current={web.page === link.page ? 'page' : undefined}
              onClick={() => go(link.page)}
            >
              {link.label}
            </button>
          ))}
          <button type="button" className="nav-link nav-link-mobile" onClick={() => go('account')}>
            {t('nav.account')}
          </button>
        </nav>
        <div className="site-actions">
          <button type="button" className="lang-toggle" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} aria-label={t('nav.language')}>
            <Icon name="languages" size={17} />
            <span>{t('nav.switchLanguage')}</span>
          </button>
          <Button variant="ghost" size="sm" icon="user" className={cx('account-btn', web.page === 'account' && 'is-active')} onClick={() => go('account')}>
            {t('nav.account')}
          </Button>
          <Button size="sm" icon="heart" onClick={() => go('cases')} className="header-cta">
            {t('common.donateNow')}
          </Button>
          <IconButton icon={menu ? 'x' : 'menu'} label={t('nav.menu')} className="menu-btn" aria-expanded={menu} onClick={() => setMenu(!menu)} />
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  const { t, f } = useT();
  const { goWeb } = usePrototype();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-about">
          <Logo size={28} />
          <p>{t('footer.aboutBody')}</p>
          <p className="footer-demo">
            <Icon name="info" size={14} /> {t('proto.demoNote')}
          </p>
        </div>
        <nav aria-label={t('footer.platform')}>
          <h4>{t('footer.platform')}</h4>
          <button type="button" onClick={() => goWeb({ page: 'cases' })}>
            {t('nav.cases')}
          </button>
          <button type="button" onClick={() => goWeb({ page: 'submit' })}>
            {t('nav.submitCase')}
          </button>
          <button type="button" onClick={() => goWeb({ page: 'account' })}>
            {t('nav.account')}
          </button>
        </nav>
        <nav aria-label={t('footer.help')}>
          <h4>{t('footer.help')}</h4>
          <span>{t('footer.faq')}</span>
          <span>{t('footer.contact')}</span>
          <span dir="ltr">care@yusr.example</span>
        </nav>
        <div className="footer-pay">
          <h4>{t('landing.paymentsTitle')}</h4>
          <PaymentPills />
        </div>
      </div>
      <div className="container footer-legal">
        <span>{t('footer.rights', { year: f.number(year, { useGrouping: false }) })}</span>
        <span>
          {t('footer.terms')} · {t('footer.privacy')}
        </span>
      </div>
    </footer>
  );
}

export function PaymentPills() {
  const { t } = useT();
  const items: Array<{ key: string; icon: 'credit-card' | 'wallet' | 'store' | 'landmark' | 'scan-face'; label: string }> = [
    { key: 'card', icon: 'credit-card', label: t('payment.methods.card') },
    { key: 'vodafone', icon: 'wallet', label: t('payment.methods.vodafone_cash') },
    { key: 'fawry', icon: 'store', label: t('payment.methods.fawry') },
    { key: 'instapay', icon: 'landmark', label: t('payment.methods.instapay') },
    { key: 'apple', icon: 'scan-face', label: 'Apple Pay' },
    { key: 'mada', icon: 'credit-card', label: t('payment.methods.mada') },
  ];
  return (
    <ul className="pay-pills">
      {items.map((item) => (
        <li key={item.key}>
          <Icon name={item.icon} size={15} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
