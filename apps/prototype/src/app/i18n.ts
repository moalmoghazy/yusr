import type { Locale } from '@yusr/core';
import { ar, en, mergeMessages, type MessageKey, type TranslationKey } from '@yusr/i18n';
import { useI18n } from '@yusr/i18n/react';
import { protoAr } from '../messages/ar';
import { protoEn } from '../messages/en';

/** Shared platform dictionary + prototype-only namespaces. */
export const MESSAGES: Record<Locale, object> = {
  ar: mergeMessages(ar, protoAr),
  en: mergeMessages(en, protoEn),
};

export type Key = TranslationKey | MessageKey<typeof protoAr>;

export function useT() {
  return useI18n<Key>();
}

/** Picks the value for the active locale from a { ar, en } pair. */
export function useL() {
  const { locale } = useI18n();
  return <T>(value: Record<Locale, T> | null | undefined): T | undefined => (value ? value[locale] : undefined);
}
