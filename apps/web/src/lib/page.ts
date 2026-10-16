import type { Locale } from '@yusr/core';
import { notFound } from 'next/navigation';
import { isLocale } from './i18n';

/** Route params arrive as a promise in the App Router. */
export type LocaleParams = Promise<{ locale: string }>;

export async function pageLocale(params: LocaleParams): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

/** First value of a search param (`?a=1&a=2` → '1'). */
export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
