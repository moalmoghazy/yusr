import { LOCALES, type Locale } from '@yusr/core';

export const DEFAULT_LOCALE: Locale = 'ar';
export const LOCALE_COOKIE = 'yusr-locale';
export const THEME_COOKIE = 'yusr-theme';

export type ThemePreference = 'system' | 'light' | 'dark';

export function isLocale(value: string | undefined | null): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? '');
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}

export function themeFrom(value: string | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Localized path helper: `href(locale, '/cases')` → `/ar/cases`. */
export function href(locale: Locale, path = ''): string {
  return `/${locale}${path}`;
}
