import { useT, useL } from './i18n';
import { PrototypeProvider, SURFACES, usePrototype, type ColorMode, type Surface } from './prefs';
import { backend, useBackendEvents } from './backend';
import { LogoMark } from '../ui/brand';
import { Icon, type IconName } from '../ui/icons';
import { Segmented, ToastProvider, cx, useToast } from '../ui/primitives';
import { WebApp } from '../web/WebApp';
import { MobileSurface } from '../mobile/MobileSurface';
import { AdminApp } from '../admin/AdminApp';
import { BrandPage } from '../brand/BrandPage';
import { TechPage } from '../tech/TechPage';

export function App() {
  return (
    <PrototypeProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </PrototypeProvider>
  );
}

const SURFACE_ICON: Record<Surface, IconName> = {
  web: 'monitor',
  mobile: 'smartphone',
  admin: 'kanban',
  brand: 'layers',
  tech: 'git-branch',
};

function Shell() {
  const { surface } = usePrototype();
  useFundedToasts();
  return (
    <div className="proto">
      <a className="skip-link" href="#surface">
        {useT().t('a11y.skipToContent')}
      </a>
      <DemoBar />
      <main id="surface" className={cx('surface', `surface-${surface}`)} tabIndex={-1}>
        {surface === 'web' && <WebApp />}
        {surface === 'mobile' && <MobileSurface />}
        {surface === 'admin' && <AdminApp />}
        {surface === 'brand' && <BrandPage />}
        {surface === 'tech' && <TechPage />}
      </main>
    </div>
  );
}

function DemoBar() {
  const { t } = useT();
  const { surface, setSurface, locale, setLocale, colorMode, setColorMode, live, setLive } = usePrototype();
  const nextMode: Record<ColorMode, ColorMode> = { auto: 'light', light: 'dark', dark: 'auto' };
  const modeIcon: Record<ColorMode, IconName> = { auto: 'monitor', light: 'sun', dark: 'moon' };
  const modeLabel: Record<ColorMode, string> = { auto: t('nav.system'), light: t('nav.light'), dark: t('nav.dark') };
  return (
    <header className="demo-bar">
      <div className="demo-bar-inner">
        <div className="demo-brand">
          <LogoMark size={24} bowl="#FFFFFF" drop="var(--highlight)" />
          <span className="demo-title">{t('proto.badge')}</span>
        </div>
        <nav className="demo-surfaces" aria-label={t('proto.title')}>
          {SURFACES.map((item) => (
            <button
              key={item}
              type="button"
              className={cx('demo-tab', surface === item && 'is-active')}
              aria-current={surface === item ? 'page' : undefined}
              onClick={() => setSurface(item)}
            >
              <Icon name={SURFACE_ICON[item]} size={16} />
              <span>{t(`proto.surfaces.${item}`)}</span>
            </button>
          ))}
        </nav>
        <div className="demo-actions">
          <button type="button" className={cx('live-toggle', live && 'is-on')} aria-pressed={live} onClick={() => setLive(!live)} title={t('proto.liveHint')}>
            <span className="live-dot" aria-hidden />
            <span className="live-toggle-label">{t('proto.live')}</span>
            <Icon name={live ? 'pause' : 'play'} size={14} />
          </button>
          <Segmented
            size="sm"
            label={t('nav.language')}
            value={locale}
            onChange={setLocale}
            className="demo-lang"
            options={[
              { value: 'ar', label: 'ع', ariaLabel: 'العربية' },
              { value: 'en', label: 'EN', ariaLabel: 'English' },
            ]}
          />
          <button
            type="button"
            className="demo-icon-btn"
            onClick={() => setColorMode(nextMode[colorMode])}
            aria-label={`${t('proto.colorMode')}: ${modeLabel[colorMode]}`}
            title={`${t('proto.colorMode')}: ${modeLabel[colorMode]}`}
          >
            <Icon name={modeIcon[colorMode]} size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Celebrates cases reaching their goal, wherever it happens (your gift or a live donor). */
function useFundedToasts() {
  const toast = useToast();
  const { t } = useT();
  const l = useL();
  const { goWeb } = usePrototype();
  useBackendEvents((event) => {
    if (event.type !== 'case.funded') return;
    const item = backend.read.adminCase(event.caseId);
    if (!item) return;
    toast({
      title: t('proto.toasts.funded', { title: l(item.title) ?? '' }),
      tone: 'gold',
      icon: 'gift',
      duration: 7_000,
      action: { label: t('common.view'), onClick: () => goWeb({ page: 'case', slug: item.slug, tab: 'transparency' }) },
    });
  });
}
