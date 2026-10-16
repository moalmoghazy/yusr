import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale, Localized } from '@yusr/core';
import { createFormatters, createTranslator, dirOf, getMessages, type Formatters, type TFunction } from '@yusr/i18n';
import { getLocales } from 'expo-localization';
import * as Updates from 'expo-updates';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DevSettings, I18nManager } from 'react-native';

const STORAGE_KEY = 'yusr.locale';

export interface I18n {
  locale: Locale;
  rtl: boolean;
  t: TFunction;
  f: Formatters;
  l: (value: Localized) => string;
  setLocale: (locale: Locale) => Promise<void>;
}

const Context = createContext<I18n | null>(null);

/** Arabic unless the device's first language is English. */
function deviceLocale(): Locale {
  return getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar';
}

/**
 * React Native applies layout direction at start-up, so switching between Arabic and English
 * persists the choice, flips I18nManager and reloads the JS bundle once.
 */
async function applyDirection(locale: Locale): Promise<void> {
  const rtl = dirOf(locale) === 'rtl';
  if (I18nManager.isRTL === rtl) return;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  if (__DEV__) DevSettings.reload();
  else await Updates.reloadAsync();
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => (saved === 'ar' || saved === 'en' ? saved : deviceLocale()))
      .catch(() => deviceLocale())
      .then(async (initial) => {
        setLocaleState(initial);
        await applyDirection(initial);
      });
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
    setLocaleState(next);
    await applyDirection(next);
  }, []);

  const value = useMemo<I18n | null>(() => {
    if (!locale) return null;
    return {
      locale,
      rtl: dirOf(locale) === 'rtl',
      t: createTranslator({ locale, messages: getMessages(locale) }).t,
      f: createFormatters(locale),
      l: (text) => text[locale] || text.ar,
      setLocale,
    };
  }, [locale, setLocale]);

  // Nothing renders until the language is known, so the first frame is already in the right direction.
  return value ? <Context.Provider value={value}>{children}</Context.Provider> : null;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
