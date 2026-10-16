import type { Locale } from '@yusr/core';
import type { TranslationKey } from './dictionary';
import { intlTag, type NumberingSystem } from './locales';
import type { MessageParams, MessageTree, MessageValue, PluralMessage } from './types';

export type TFunction<K extends string = TranslationKey> = (key: K, params?: MessageParams) => string;

export interface TranslatorOptions {
  locale: Locale;
  messages: object;
  numberingSystem?: NumberingSystem;
  /** Called once per missing key (log to Sentry in production). */
  onMissing?: (key: string, locale: Locale) => void;
}

export interface Translator<K extends string = TranslationKey> {
  locale: Locale;
  t: TFunction<K>;
  has: (key: string) => boolean;
}

function isPlural(value: unknown): value is PluralMessage {
  return typeof value === 'object' && value !== null && typeof (value as PluralMessage).other === 'string';
}

function lookup(messages: MessageTree, key: string): MessageValue | MessageTree | undefined {
  let node: MessageValue | MessageTree | undefined = messages;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string' || isPlural(node)) return undefined;
    node = (node as MessageTree)[part];
  }
  return node;
}

/**
 * ICU-lite translator: `{name}` interpolation (numbers are localized, so Arabic shows ١٢٣)
 * and CLDR plural selection via Intl.PluralRules — the six Arabic forms included.
 */
export function createTranslator<K extends string = TranslationKey>(options: TranslatorOptions): Translator<K> {
  const tag = intlTag(options.locale, options.numberingSystem);
  const numberFormat = new Intl.NumberFormat(tag);
  const pluralRules = new Intl.PluralRules(tag);
  const messages = options.messages as MessageTree;
  const reported = new Set<string>();

  const interpolate = (template: string, params?: MessageParams) =>
    template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params?.[name];
      if (value === undefined || value === null) return match;
      return typeof value === 'number' ? numberFormat.format(value) : value;
    });

  const t: TFunction<K> = (key, params) => {
    const value = lookup(messages, key);
    if (typeof value === 'string') return interpolate(value, params);
    if (isPlural(value)) {
      const count = typeof params?.count === 'number' ? params.count : 0;
      // An explicit `zero` form acts like ICU's "=0" in every language (English has no CLDR zero).
      const category = count === 0 && value.zero !== undefined ? 'zero' : (pluralRules.select(count) as keyof PluralMessage);
      return interpolate(value[category] ?? value.other, { ...params, count });
    }
    if (!reported.has(key)) {
      reported.add(key);
      options.onMissing?.(key, options.locale);
    }
    return key;
  };

  return {
    locale: options.locale,
    t,
    has: (key: string) => {
      const value = lookup(messages, key);
      return typeof value === 'string' || isPlural(value);
    },
  };
}

/** Deep-merges app-specific namespaces into the shared dictionary. */
export function mergeMessages<A extends object, B extends object>(base: A, extra: B): A & B {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(extra)) {
    const current = result[key];
    result[key] =
      typeof current === 'object' && current !== null && typeof value === 'object' && value !== null && !isPlural(value)
        ? mergeMessages(current as object, value as object)
        : value;
  }
  return result as A & B;
}
