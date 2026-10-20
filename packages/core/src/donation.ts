import { DomainError } from './errors';
import { isDonatable } from './lifecycle';
import { CURRENCY_META, DEMO_FX, convertMinor, fxRate, type FxTable } from './money';
import { DEFAULT_FEES, feeFor, feeRuleFor, grossUpForFee, resolveProvider, type FeeSchedule } from './payments';
import type { CaseStatus, CreateDonationRequest, Currency, DonationBreakdown, PaymentMethod } from './types';

/**
 * Who bears the processing fee when the donor does not cover it.
 *  - case_absorbs: the case is credited amount − fee (default, fully shown on the receipt).
 *  - platform_absorbs: the case is credited the full amount; the platform pays the fee.
 */
export type FeePolicy = 'case_absorbs' | 'platform_absorbs';

export interface BreakdownInput {
  amountMinor: number;
  currency: Currency;
  method: PaymentMethod;
  coverFees: boolean;
  caseCurrency: Currency;
  fx?: FxTable;
  feeSchedule?: FeeSchedule;
  feePolicy?: FeePolicy;
}

/**
 * Single source of truth for "what is charged, what the gateway keeps, what the case gets".
 * The API uses it authoritatively; web and mobile use it to show the same numbers before paying.
 */
export function computeDonationBreakdown(input: BreakdownInput): DonationBreakdown {
  const { amountMinor, currency, method, coverFees, caseCurrency } = input;
  const fx = input.fx ?? DEMO_FX;
  const policy = input.feePolicy ?? 'case_absorbs';

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new DomainError('VALIDATION_FAILED', 'amountMinor must be a positive integer');
  }
  const provider = resolveProvider(method, currency);
  if (!provider) {
    throw new DomainError('METHOD_NOT_AVAILABLE', `${method} is not available for ${currency}`, { method, currency });
  }

  const rule = feeRuleFor(provider, method, input.feeSchedule ?? DEFAULT_FEES);
  const chargedMinor = coverFees ? grossUpForFee(amountMinor, rule) : amountMinor;
  const estimatedFeeMinor = feeFor(chargedMinor, rule);
  const donorCoveredFeeMinor = chargedMinor - amountMinor;

  const netInDonorCurrency = coverFees || policy === 'platform_absorbs' ? amountMinor : Math.max(0, amountMinor - estimatedFeeMinor);

  return {
    provider,
    currency,
    amountMinor,
    chargedMinor,
    estimatedFeeMinor,
    donorCoveredFeeMinor,
    caseCurrency,
    netToCaseMinor: convertMinor(netInDonorCurrency, currency, caseCurrency, fx),
    fxRate: fxRate(currency, caseCurrency, fx),
  };
}

export interface DonationContext {
  caseStatus: CaseStatus;
  caseZakatEligible: boolean;
  isGuest: boolean;
  /** What the case still needs, in the donation's currency (remainingInCurrency); omitted = no cap. */
  remainingMinor?: number;
}

/**
 * What a case still needs to reach its goal, in the donor's currency. Rounded down, so a gift of
 * exactly this amount never takes the case past its goal.
 */
export function remainingInCurrency(item: { goalMinor: number; raisedMinor: number; currency: Currency }, currency: Currency, fx: FxTable = DEMO_FX): number {
  const remaining = Math.max(0, item.goalMinor - item.raisedMinor);
  if (currency === item.currency) return remaining;
  const expDiff = CURRENCY_META[currency].exponent - CURRENCY_META[item.currency].exponent;
  return Math.floor(remaining * fxRate(item.currency, currency, fx) * 10 ** expDiff);
}

export const DEDICATION_MAX_LENGTH = 140;

/** Throws the first rule a donation request breaks. */
export function assertDonationAllowed(
  request: Pick<CreateDonationRequest, 'amountMinor' | 'currency' | 'method' | 'type' | 'dedication'>,
  context: DonationContext,
): void {
  if (!isDonatable(context.caseStatus)) {
    throw new DomainError('CASE_NOT_DONATABLE', `Case is ${context.caseStatus}`, { status: context.caseStatus });
  }
  if (!resolveProvider(request.method, request.currency)) {
    throw new DomainError('METHOD_NOT_AVAILABLE', undefined, { method: request.method, currency: request.currency });
  }
  const meta = CURRENCY_META[request.currency];
  const { remainingMinor } = context;
  if (remainingMinor !== undefined && request.amountMinor > remainingMinor) {
    throw new DomainError('AMOUNT_ABOVE_REMAINING', undefined, { remainingMinor, currency: request.currency, field: 'amountMinor' });
  }
  // A gift that completes the case is welcome even when what is left is below the usual minimum.
  const completes = remainingMinor !== undefined && request.amountMinor === remainingMinor && remainingMinor > 0;
  if (!Number.isInteger(request.amountMinor) || (request.amountMinor < meta.minDonationMinor && !completes)) {
    throw new DomainError('AMOUNT_TOO_LOW', undefined, { minMinor: meta.minDonationMinor, currency: request.currency });
  }
  if (context.isGuest && request.amountMinor > meta.guestMaxMinor) {
    throw new DomainError('AMOUNT_TOO_HIGH_FOR_GUEST', undefined, { maxMinor: meta.guestMaxMinor, currency: request.currency });
  }
  if (request.type === 'zakat' && !context.caseZakatEligible) {
    throw new DomainError('ZAKAT_NOT_ELIGIBLE');
  }
  if (request.dedication && request.dedication.trim().length > DEDICATION_MAX_LENGTH) {
    throw new DomainError('DEDICATION_TOO_LONG', undefined, { max: DEDICATION_MAX_LENGTH });
  }
}
