import type { Locale } from '@yusr/core';
import type { Messages } from './dictionary';
import { ar } from './messages/ar';
import { en } from './messages/en';

export * from './types';
export * from './dictionary';
export * from './locales';
export * from './translator';
export * from './format';
export * from './share';
export { ar, en };

export const dictionaries: Readonly<Record<Locale, Messages>> = { ar, en };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}
