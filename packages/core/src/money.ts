import type { Currency } from './types';

/**
 * All money is stored and computed as integers in minor units (piastres, halalas, cents).
 * Floating point never touches a balance.
 */

export interface CurrencyMeta {
  code: Currency;
  /** Number of minor-unit digits (2 for EGP / SAR / USD). */
  exponent: number;
  /** Smallest donation accepted, in minor units. */
  minDonationMinor: number;
  /** Largest guest (unauthenticated) donation before KYC is required, in minor units. */
  guestMaxMinor: number;
  /** One-tap micro-donation presets, in major units. */
  quickAmounts: readonly number[];
}

export const CURRENCY_META: Readonly<Record<Currency, CurrencyMeta>> = {
  EGP: { code: 'EGP', exponent: 2, minDonationMinor: 10_00, guestMaxMinor: 50_000_00, quickAmounts: [50, 100, 250, 500] },
  SAR: { code: 'SAR', exponent: 2, minDonationMinor: 5_00, guestMaxMinor: 10_000_00, quickAmounts: [10, 50, 100, 250] },
  USD: { code: 'USD', exponent: 2, minDonationMinor: 1_00, guestMaxMinor: 3_000_00, quickAmounts: [10, 25, 50, 100] },
};

export function toMinor(major: number, currency: Currency): number {
  if (!Number.isFinite(major)) throw new RangeError(`Invalid amount: ${major}`);
  const exponent = CURRENCY_META[currency].exponent;
  // Scale through the decimal string to avoid 1.005 * 100 = 100.49999 artefacts.
  const scaled = Number(`${major}e${exponent}`);
  return Math.round(Number.isFinite(scaled) ? scaled : major * 10 ** exponent);
}

export function fromMinor(minor: number, currency: Currency): number {
  return minor / 10 ** CURRENCY_META[currency].exponent;
}

/**
 * FX table expressed as "units of the reference currency per 1 unit of X".
 * Rates are locked on the donation at creation time and stored with it.
 */
export interface FxTable {
  reference: Currency;
  rates: Readonly<Record<Currency, number>>;
  asOf: string;
}

/** Indicative demo rates — production reads a daily feed (CBE / SAMA / provider). */
export const DEMO_FX: FxTable = {
  reference: 'EGP',
  rates: { EGP: 1, SAR: 13.45, USD: 50.45 },
  asOf: '2026-09-26T00:00:00Z',
};

export function fxRate(from: Currency, to: Currency, fx: FxTable): number {
  if (from === to) return 1;
  const fromRate = fx.rates[from];
  const toRate = fx.rates[to];
  if (!fromRate || !toRate) throw new RangeError(`Missing FX rate for ${from}→${to}`);
  return fromRate / toRate;
}

export function convertMinor(amountMinor: number, from: Currency, to: Currency, fx: FxTable): number {
  if (from === to) return amountMinor;
  const rate = fxRate(from, to, fx);
  const expDiff = CURRENCY_META[to].exponent - CURRENCY_META[from].exponent;
  return Math.round(amountMinor * rate * 10 ** expDiff);
}

// prettier-ignore
const DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * Parses what people actually type into an amount field:
 * Arabic-Indic or Persian digits, Arabic separators (٬ ٫), commas and spaces.
 * Returns the amount in major units, or null when the input is not a positive number.
 */
export function parseAmountInput(raw: string): number | null {
  const normalized = raw
    .trim()
    .replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d] ?? d)
    .replace(/[\u066C,\s]/g, '')
    .replace(/\u066B/g, '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 ? value : null;
}

/**
 * Splits `totalMinor` across weights with the largest-remainder method so the parts
 * always sum exactly to the total (used for disbursement plans and fee splits).
 */
export function allocateMinor(totalMinor: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) throw new RangeError('totalMinor must be a non-negative integer');
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || weightSum <= 0) throw new RangeError('weights must sum to a positive number');
  const raw = weights.map((w) => (totalMinor * w) / weightSum);
  const floors = raw.map(Math.floor);
  let remainder = totalMinor - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}
