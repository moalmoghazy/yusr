import type { Currency, PaymentMethod, PaymentProvider } from './types';

/**
 * Which gateway processes each (method, currency) pair.
 *  - EGP: Paymob (cards, Apple Pay, Vodafone Cash wallets), Fawry (pay-at-outlet reference), InstaPay (bank transfer).
 *  - SAR: Moyasar (mada, cards, Apple Pay).
 *  - USD: Stripe (international cards, Apple Pay).
 * Change routing here (or override from config) without touching controllers.
 */
export const PAYMENT_ROUTES: Readonly<Record<PaymentMethod, Partial<Record<Currency, PaymentProvider>>>> = {
  card: { EGP: 'paymob', SAR: 'moyasar', USD: 'stripe' },
  apple_pay: { EGP: 'paymob', SAR: 'moyasar', USD: 'stripe' },
  mada: { SAR: 'moyasar' },
  vodafone_cash: { EGP: 'paymob' },
  fawry: { EGP: 'fawry' },
  instapay: { EGP: 'instapay' },
};

export type CheckoutFlow = 'hosted' | 'native_sheet' | 'wallet' | 'reference' | 'bank_transfer';

export interface MethodMeta {
  method: PaymentMethod;
  flow: CheckoutFlow;
  /** True when the money arrives later than the checkout (outlet cash, bank transfer). */
  settlesAsync: boolean;
}

export const METHOD_META: Readonly<Record<PaymentMethod, MethodMeta>> = {
  card: { method: 'card', flow: 'hosted', settlesAsync: false },
  apple_pay: { method: 'apple_pay', flow: 'native_sheet', settlesAsync: false },
  mada: { method: 'mada', flow: 'hosted', settlesAsync: false },
  vodafone_cash: { method: 'vodafone_cash', flow: 'wallet', settlesAsync: false },
  fawry: { method: 'fawry', flow: 'reference', settlesAsync: true },
  instapay: { method: 'instapay', flow: 'bank_transfer', settlesAsync: true },
};

/** Display order per currency (most used first). */
const METHOD_ORDER: Readonly<Record<Currency, readonly PaymentMethod[]>> = {
  EGP: ['card', 'vodafone_cash', 'instapay', 'fawry', 'apple_pay'],
  SAR: ['mada', 'apple_pay', 'card'],
  USD: ['card', 'apple_pay'],
};

export function resolveProvider(method: PaymentMethod, currency: Currency): PaymentProvider | null {
  return PAYMENT_ROUTES[method][currency] ?? null;
}

export function methodsForCurrency(currency: Currency): PaymentMethod[] {
  return METHOD_ORDER[currency].filter((method) => resolveProvider(method, currency) !== null);
}

export interface FeeRule {
  /** Percentage in basis points (275 = 2.75%). */
  percentBps: number;
  /** Fixed fee in minor units of the charge currency. */
  fixedMinor: number;
  minMinor?: number;
  maxMinor?: number;
}

export type FeeSchedule = Readonly<Record<PaymentProvider, Partial<Record<PaymentMethod, FeeRule>>>>;

/**
 * Indicative processing fees used for estimates and the "cover the fees" option.
 * Replace with your contracted rates (config/env) — the ledger always records the
 * actual fee reported by the gateway, not this estimate.
 */
export const DEFAULT_FEES: FeeSchedule = {
  paymob: {
    card: { percentBps: 275, fixedMinor: 3_00 },
    apple_pay: { percentBps: 275, fixedMinor: 3_00 },
    vodafone_cash: { percentBps: 200, fixedMinor: 0 },
  },
  fawry: {
    fawry: { percentBps: 150, fixedMinor: 2_50, minMinor: 5_00 },
  },
  stripe: {
    card: { percentBps: 290, fixedMinor: 30 },
    apple_pay: { percentBps: 290, fixedMinor: 30 },
  },
  moyasar: {
    mada: { percentBps: 100, fixedMinor: 1_00 },
    card: { percentBps: 275, fixedMinor: 1_00 },
    apple_pay: { percentBps: 275, fixedMinor: 1_00 },
  },
  instapay: {
    instapay: { percentBps: 0, fixedMinor: 0 },
  },
};

const ZERO_FEE: FeeRule = { percentBps: 0, fixedMinor: 0 };

export function feeRuleFor(provider: PaymentProvider, method: PaymentMethod, schedule: FeeSchedule = DEFAULT_FEES): FeeRule {
  return schedule[provider][method] ?? ZERO_FEE;
}

export function feeFor(chargeMinor: number, rule: FeeRule): number {
  if (chargeMinor <= 0) return 0;
  let fee = Math.ceil((chargeMinor * rule.percentBps) / 10_000) + rule.fixedMinor;
  if (rule.minMinor !== undefined) fee = Math.max(fee, rule.minMinor);
  if (rule.maxMinor !== undefined) fee = Math.min(fee, rule.maxMinor);
  return Math.min(fee, chargeMinor);
}

/**
 * Smallest charge C such that C − fee(C) ≥ net. Used when the donor ticks
 * "cover the processing fee" so the case receives the full intended amount.
 */
export function grossUpForFee(netMinor: number, rule: FeeRule): number {
  if (netMinor <= 0) return 0;
  const rate = rule.percentBps / 10_000;
  let charge = Math.ceil((netMinor + rule.fixedMinor) / (1 - rate));
  while (charge - feeFor(charge, rule) < netMinor) charge += 1;
  while (charge - 1 - feeFor(charge - 1, rule) >= netMinor) charge -= 1;
  return charge;
}
