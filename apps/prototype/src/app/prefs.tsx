import type { Locale } from '@yusr/core';
import { I18nProvider } from '@yusr/i18n/react';
import { cssText, defaultTheme, type Theme } from '@yusr/theme';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { backend, PERSONAS, type Persona } from './backend';
import { MESSAGES } from './i18n';

export type Surface = 'web' | 'mobile' | 'admin' | 'brand' | 'tech';
/** Surfaces shown in the demo bar. The architecture page joins once the API code it documents is in place. */
export const SURFACES: readonly Surface[] = ['web', 'mobile', 'admin', 'brand', 'tech'];
export type ColorMode = 'auto' | 'light' | 'dark';

export type WebPage = 'home' | 'cases' | 'case' | 'account' | 'submit';
export interface WebRoute {
  page: WebPage;
  slug?: string;
  /** Tab to open on the case page. */
  tab?: string;
  /** Category pre-selected in the catalog. */
  category?: string;
}

export type AdminSection = 'overview' | 'cases' | 'verification' | 'finance' | 'crm' | 'team' | 'audit';
export interface AdminRoute {
  section: AdminSection;
  caseId?: string;
  financeTab?: string;
}

interface PrototypeState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  surface: Surface;
  setSurface: (surface: Surface) => void;
  web: WebRoute;
  goWeb: (route: WebRoute) => void;
  admin: AdminRoute;
  goAdmin: (route: AdminRoute, personaId?: string) => void;
  persona: Persona;
  setPersonaId: (id: string) => void;
  live: boolean;
  setLive: (on: boolean) => void;
  reducedMotion: boolean;
}

const Context = createContext<PrototypeState | null>(null);

const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(`yusr.proto.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(`yusr.proto.${key}`, value);
    } catch {
      // Storage can be unavailable (private mode, previews) — preferences are a convenience only.
    }
  },
};

function initialSurface(): Surface {
  const hash = window.location.hash.replace('#', '');
  if ((SURFACES as readonly string[]).includes(hash)) return hash as Surface;
  const saved = storage.get('surface');
  return (SURFACES as readonly string[]).includes(saved ?? '') ? (saved as Surface) : 'web';
}

const originalThemeAttr = document.documentElement.getAttribute('data-theme');

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (storage.get('locale') === 'en' ? 'en' : 'ar'));
  const [colorMode, setColorModeState] = useState<ColorMode>(() => {
    const saved = storage.get('colorMode');
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  });
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [surface, setSurfaceState] = useState<Surface>(initialSurface);
  const [web, setWeb] = useState<WebRoute>({ page: 'home' });
  const [admin, setAdmin] = useState<AdminRoute>({ section: 'overview' });
  const [personaId, setPersonaId] = useState<string>(PERSONAS[0]!.id);
  const [live, setLiveState] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = locale === 'ar' ? 'rtl' : 'ltr';
    storage.set('locale', locale);
  }, [locale]);

  useEffect(() => {
    const root = document.documentElement;
    if (colorMode === 'auto') {
      if (originalThemeAttr) root.setAttribute('data-theme', originalThemeAttr);
      else root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', colorMode);
    }
    storage.set('colorMode', colorMode);
  }, [colorMode]);

  useEffect(() => {
    const tag = document.getElementById('yusr-tokens');
    if (tag && theme !== defaultTheme) tag.textContent = cssText(theme);
    else if (tag && theme === defaultTheme) tag.textContent = cssText(defaultTheme);
  }, [theme]);

  useEffect(() => {
    storage.set('surface', surface);
    try {
      window.history.replaceState(null, '', `#${surface}`);
    } catch {
      // History can be locked down inside some frames.
    }
  }, [surface]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query?.matches ?? false);
    query?.addEventListener?.('change', update);
    return () => query?.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (live) backend.simulate.startLive();
    else backend.simulate.stopLive();
    return () => backend.simulate.stopLive();
  }, [live]);

  // Start the live simulation shortly after load so the page feels alive, unless motion is reduced.
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(() => setLiveState(true), 2_500);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const setColorMode = useCallback((mode: ColorMode) => setColorModeState(mode), []);
  const setSurface = useCallback((next: Surface) => {
    setSurfaceState(next);
    window.scrollTo({ top: 0 });
  }, []);
  const goWeb = useCallback((route: WebRoute) => {
    setWeb(route);
    setSurfaceState('web');
    window.scrollTo({ top: 0 });
  }, []);
  const goAdmin = useCallback((route: AdminRoute, nextPersona?: string) => {
    setAdmin(route);
    if (nextPersona) setPersonaId(nextPersona);
    setSurfaceState('admin');
    window.scrollTo({ top: 0 });
  }, []);

  const persona = PERSONAS.find((entry) => entry.id === personaId) ?? PERSONAS[0]!;

  const value = useMemo<PrototypeState>(
    () => ({
      locale,
      setLocale,
      colorMode,
      setColorMode,
      theme,
      setTheme,
      surface,
      setSurface,
      web,
      goWeb,
      admin,
      goAdmin,
      persona,
      setPersonaId,
      live,
      setLive: setLiveState,
      reducedMotion,
    }),
    [locale, setLocale, colorMode, setColorMode, theme, surface, setSurface, web, goWeb, admin, goAdmin, persona, live, reducedMotion],
  );

  return (
    <Context.Provider value={value}>
      <I18nProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </I18nProvider>
    </Context.Provider>
  );
}

export function usePrototype(): PrototypeState {
  const value = useContext(Context);
  if (!value) throw new Error('usePrototype must be used inside <PrototypeProvider>');
  return value;
}
