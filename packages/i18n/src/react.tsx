'use client';

import type { Locale } from '@yusr/core';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { TranslationKey } from './dictionary';
import { createFormatters, type Formatters } from './format';
import { dictionaries } from './index';
import { LOCALE_CONFIG, type Direction, type LocaleConfig, type NumberingSystem } from './locales';
import { createTranslator, type TFunction } from './translator';

export interface I18nContextValue<K extends string = TranslationKey> {
  locale: Locale;
  dir: Direction;
  config: LocaleConfig;
  t: TFunction<K>;
  f: Formatters;
}

const I18nContext = createContext<I18nContextValue<string> | null>(null);

export interface I18nProviderProps {
  locale: Locale;
  /** Defaults to the shared dictionary; pass a merged dictionary to add app namespaces. */
  messages?: object;
  numberingSystem?: NumberingSystem;
  timeZone?: string;
  onMissing?: (key: string, locale: Locale) => void;
  children: ReactNode;
}

/** Works in Next.js client components and React Native alike (no DOM access). */
export function I18nProvider({ locale, messages, numberingSystem, timeZone, onMissing, children }: I18nProviderProps) {
  const value = useMemo<I18nContextValue<string>>(() => {
    const translator = createTranslator<string>({
      locale,
      messages: messages ?? dictionaries[locale],
      numberingSystem,
      onMissing,
    });
    return {
      locale,
      dir: LOCALE_CONFIG[locale].dir,
      config: LOCALE_CONFIG[locale],
      t: translator.t,
      f: createFormatters(locale, { numberingSystem, timeZone }),
    };
  }, [locale, messages, numberingSystem, timeZone, onMissing]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n<K extends string = TranslationKey>(): I18nContextValue<K> {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value as I18nContextValue<K>;
}

export function useT<K extends string = TranslationKey>(): TFunction<K> {
  return useI18n<K>().t;
}
