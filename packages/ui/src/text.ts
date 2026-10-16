import type { Locale, Localized } from '@yusr/core';
import { createFormatters, createTranslator, dirOf, getMessages, type Formatters, type TFunction } from '@yusr/i18n';

/** Everything a component needs to speak one locale. Pure and cached: safe in Server Components. */
export interface Text {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  t: TFunction;
  f: Formatters;
  /** Picks the locale's side of a { ar, en } pair. */
  l: (value: Localized) => string;
}

const cache = new Map<Locale, Text>();

export function textFor(locale: Locale): Text {
  let text = cache.get(locale);
  if (!text) {
    text = {
      locale,
      dir: dirOf(locale),
      t: createTranslator({ locale, messages: getMessages(locale) }).t,
      f: createFormatters(locale),
      l: (value) => value[locale] || value.ar,
    };
    cache.set(locale, text);
  }
  return text;
}
