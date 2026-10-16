import { LOCALES, type Locale } from '@yusr/core';

export type Direction = 'rtl' | 'ltr';
export type NumberingSystem = 'arab' | 'latn';

export interface LocaleConfig {
  locale: Locale;
  dir: Direction;
  /** BCP 47 tag used for Intl formatting. */
  intl: string;
  /** Default digits: Arabic-Indic (٠١٢) for Arabic, Latin for English. Apps may override. */
  numberingSystem: NumberingSystem;
  /** Native name, shown in the language switcher. */
  label: string;
  /** Short label for compact toggles. */
  short: string;
}

export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALE_CONFIG: Readonly<Record<Locale, LocaleConfig>> = {
  ar: { locale: 'ar', dir: 'rtl', intl: 'ar-EG', numberingSystem: 'arab', label: 'العربية', short: 'ع' },
  en: { locale: 'en', dir: 'ltr', intl: 'en-US', numberingSystem: 'latn', label: 'English', short: 'EN' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): Direction {
  return LOCALE_CONFIG[locale].dir;
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}

export function intlTag(locale: Locale, numberingSystem?: NumberingSystem): string {
  const config = LOCALE_CONFIG[locale];
  return `${config.intl}-u-nu-${numberingSystem ?? config.numberingSystem}`;
}

/** Picks the best supported locale from an Accept-Language header or device list. Arabic wins ties. */
export function negotiateLocale(preferences: string | readonly string[] | null | undefined): Locale {
  const list = typeof preferences === 'string' ? parseAcceptLanguage(preferences) : (preferences ?? []);
  for (const tag of list) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim(), q: q ? Number.parseFloat(q.split('=')[1] ?? '1') : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}
