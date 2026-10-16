import { CURRENCY_META, type Currency, type Locale } from '@yusr/core';
import { intlTag, type NumberingSystem } from './locales';

export interface MoneyFormatOptions {
  /** 18.4M / ١٨٫٤ مليون */
  compact?: boolean;
  /** Omit the currency label (e.g. inside a column already titled "EGP"). */
  showCurrency?: boolean;
  /** 'auto' shows decimals only when the amount has piastres/halalas/cents. */
  fractionDigits?: 'auto' | 0 | 2;
}

export interface Formatters {
  locale: Locale;
  intl: string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  money: (minor: number, currency: Currency, options?: MoneyFormatOptions) => string;
  /** Whole-number percentage (0–100) → "٧٦٪" / "76%". */
  percent: (value: number) => string;
  compact: (value: number) => string;
  date: (value: string | number | Date, style?: 'short' | 'medium' | 'long') => string;
  dateTime: (value: string | number | Date) => string;
  time: (value: string | number | Date) => string;
  relative: (value: string | number | Date, now?: number) => string;
  currencyLabel: (currency: Currency) => string;
}

const CURRENCY_LABELS: Readonly<Record<Locale, Readonly<Record<Currency, string>>>> = {
  ar: { EGP: 'ج.م', SAR: 'ر.س', USD: 'دولار' },
  en: { EGP: 'EGP', SAR: 'SAR', USD: 'USD' },
};

const NBSP = '\u00A0';

export interface FormatterOptions {
  numberingSystem?: NumberingSystem;
  /** Receipts and deadlines are shown in the platform's operating time zone. */
  timeZone?: string;
}

export function createFormatters(locale: Locale, options: FormatterOptions = {}): Formatters {
  const tag = intlTag(locale, options.numberingSystem);
  const timeZone = options.timeZone ?? 'Africa/Cairo';
  const cache = new Map<string, Intl.NumberFormat>();
  const numberFormat = (opts: Intl.NumberFormatOptions = {}) => {
    const key = JSON.stringify(opts);
    let formatter = cache.get(key);
    if (!formatter) {
      formatter = new Intl.NumberFormat(tag, opts);
      cache.set(key, formatter);
    }
    return formatter;
  };
  const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));
  const relativeFormat = new Intl.RelativeTimeFormat(tag, { numeric: 'auto', style: 'long' });

  const money: Formatters['money'] = (minor, currency, opts = {}) => {
    const exponent = CURRENCY_META[currency].exponent;
    const major = minor / 10 ** exponent;
    const hasFraction = minor % 10 ** exponent !== 0;
    const digits = opts.fractionDigits === 'auto' || opts.fractionDigits === undefined ? (hasFraction ? 2 : 0) : opts.fractionDigits;
    const amount = opts.compact
      ? numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(major)
      : numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
    if (opts.showCurrency === false) return amount;
    if (locale === 'en') return currency === 'USD' ? `$${amount}` : `${CURRENCY_LABELS.en[currency]}${NBSP}${amount}`;
    return `${amount}${NBSP}${CURRENCY_LABELS.ar[currency]}`;
  };

  return {
    locale,
    intl: tag,
    number: (value, opts) => numberFormat(opts).format(value),
    money,
    percent: (value) => numberFormat({ style: 'percent', maximumFractionDigits: 0 }).format(value / 100),
    compact: (value) => numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(value),
    date: (value, style = 'medium') =>
      new Intl.DateTimeFormat(tag, {
        timeZone,
        ...(style === 'short'
          ? { day: 'numeric', month: 'numeric', year: 'numeric' }
          : style === 'long'
            ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
            : { day: 'numeric', month: 'long', year: 'numeric' }),
      }).format(toDate(value)),
    dateTime: (value) => new Intl.DateTimeFormat(tag, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(toDate(value)),
    time: (value) => new Intl.DateTimeFormat(tag, { timeZone, hour: 'numeric', minute: '2-digit' }).format(toDate(value)),
    relative: (value, now = Date.now()) => {
      const seconds = Math.round((toDate(value).getTime() - now) / 1000);
      const abs = Math.abs(seconds);
      if (abs < 45) return relativeFormat.format(0, 'second');
      if (abs < 3_600) return relativeFormat.format(Math.round(seconds / 60), 'minute');
      if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3_600), 'hour');
      if (abs < 604_800) return relativeFormat.format(Math.round(seconds / 86_400), 'day');
      if (abs < 2_629_800) return relativeFormat.format(Math.round(seconds / 604_800), 'week');
      return relativeFormat.format(Math.round(seconds / 2_629_800), 'month');
    },
    currencyLabel: (currency) => CURRENCY_LABELS[locale][currency],
  };
}
