import { DomainError } from './errors';
import type { Currency, PaymentProvider } from './types';

/**
 * Double-entry ledger. Every money movement is a transaction made of postings whose
 * debits equal credits *per currency*. Cross-currency donations pass through FX
 * position accounts so each currency balances on its own.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type Direction = 'debit' | 'credit';

export const ACCOUNTS = {
  /** Money a payment provider owes us until it settles to the bank. */
  clearing: (provider: PaymentProvider) => `asset:clearing:${provider}`,
  bank: 'asset:bank:operating',
  /** Money held on behalf of a case until it is disbursed to payees. */
  caseFund: (caseId: string) => `liability:case:${caseId}`,
  gatewayFees: 'expense:gateway_fees',
  feeRecovery: 'revenue:fee_recovery',
  fxPosition: (currency: Currency) => `equity:fx:${currency}`,
} as const;

export interface Posting {
  account: string;
  direction: Direction;
  amountMinor: number;
  currency: Currency;
  memo?: string;
}

export function accountType(account: string): AccountType {
  const prefix = account.split(':')[0];
  switch (prefix) {
    case 'asset':
    case 'liability':
    case 'equity':
    case 'revenue':
    case 'expense':
      return prefix;
    default:
      throw new RangeError(`Unknown account type for ${account}`);
  }
}

export function assertBalanced(postings: readonly Posting[]): void {
  const totals = new Map<Currency, number>();
  for (const posting of postings) {
    if (!Number.isInteger(posting.amountMinor) || posting.amountMinor < 0) {
      throw new DomainError('LEDGER_UNBALANCED', `Posting amounts must be non-negative integers (${posting.account})`);
    }
    const sign = posting.direction === 'debit' ? 1 : -1;
    totals.set(posting.currency, (totals.get(posting.currency) ?? 0) + sign * posting.amountMinor);
  }
  for (const [currency, total] of totals) {
    if (total !== 0) {
      throw new DomainError('LEDGER_UNBALANCED', `Transaction is off by ${total} ${currency} minor units`, { currency, total });
    }
  }
}

/** Natural balance of an account: positive means "normal" (assets/expenses debit, others credit). */
export function balanceOf(account: string, postings: readonly Posting[], currency?: Currency): number {
  const debitNormal = ['asset', 'expense'].includes(accountType(account));
  let balance = 0;
  for (const posting of postings) {
    if (posting.account !== account) continue;
    if (currency && posting.currency !== currency) continue;
    const signed = posting.direction === 'debit' ? posting.amountMinor : -posting.amountMinor;
    balance += debitNormal ? signed : -signed;
  }
  return balance;
}

export interface DonationSettlement {
  caseId: string;
  provider: PaymentProvider;
  /** Currency the donor was charged in. */
  currency: Currency;
  chargedMinor: number;
  /** Actual fee reported by the gateway (charge currency). */
  feeMinor: number;
  caseCurrency: Currency;
  /** Credited to the case (case currency), as locked on the donation. */
  netToCaseMinor: number;
  /** Case-currency units per 1 unit of charge currency, locked at creation. */
  fxRate: number;
}

function convertedCharge(settlement: DonationSettlement): number {
  return settlement.currency === settlement.caseCurrency ? settlement.chargedMinor : Math.round(settlement.chargedMinor * settlement.fxRate);
}

function nonZero(postings: Posting[]): Posting[] {
  return postings.filter((posting) => posting.amountMinor > 0);
}

/** Postings for a successful donation. */
export function buildDonationPostings(settlement: DonationSettlement): Posting[] {
  const { caseId, provider, currency, chargedMinor, feeMinor, caseCurrency, netToCaseMinor } = settlement;
  if (feeMinor < 0 || feeMinor > chargedMinor) {
    throw new DomainError('VALIDATION_FAILED', 'Gateway fee must be between 0 and the charged amount');
  }
  const chargeInCaseCurrency = convertedCharge(settlement);
  if (netToCaseMinor < 0 || netToCaseMinor > chargeInCaseCurrency) {
    throw new DomainError('VALIDATION_FAILED', 'Case credit cannot exceed the charged amount');
  }

  const postings: Posting[] = [
    { account: ACCOUNTS.clearing(provider), direction: 'debit', amountMinor: chargedMinor - feeMinor, currency, memo: 'gateway receivable' },
    { account: ACCOUNTS.gatewayFees, direction: 'debit', amountMinor: feeMinor, currency, memo: 'processing fee' },
  ];

  if (currency !== caseCurrency) {
    postings.push(
      { account: ACCOUNTS.fxPosition(currency), direction: 'credit', amountMinor: chargedMinor, currency, memo: 'fx conversion out' },
      { account: ACCOUNTS.fxPosition(caseCurrency), direction: 'debit', amountMinor: chargeInCaseCurrency, currency: caseCurrency, memo: 'fx conversion in' },
    );
  }

  postings.push(
    { account: ACCOUNTS.caseFund(caseId), direction: 'credit', amountMinor: netToCaseMinor, currency: caseCurrency, memo: 'donation to case' },
    { account: ACCOUNTS.feeRecovery, direction: 'credit', amountMinor: chargeInCaseCurrency - netToCaseMinor, currency: caseCurrency, memo: 'fee recovered' },
  );

  const result = nonZero(postings);
  assertBalanced(result);
  return result;
}

/**
 * Postings for a (partial) refund. The gateway pulls the refunded charge back from us;
 * the original processing fee is not returned by gateways, so it stays expensed.
 */
export function buildRefundPostings(settlement: DonationSettlement, refundChargedMinor: number): Posting[] {
  if (!Number.isInteger(refundChargedMinor) || refundChargedMinor <= 0 || refundChargedMinor > settlement.chargedMinor) {
    throw new DomainError('REFUND_EXCEEDS_DONATION');
  }
  const ratio = refundChargedMinor / settlement.chargedMinor;
  const chargeInCaseCurrency = convertedCharge(settlement);
  const refundInCaseCurrency = settlement.currency === settlement.caseCurrency ? refundChargedMinor : Math.round(chargeInCaseCurrency * ratio);
  const caseDebit = Math.min(refundInCaseCurrency, Math.round(settlement.netToCaseMinor * ratio));

  const postings: Posting[] = [
    { account: ACCOUNTS.caseFund(settlement.caseId), direction: 'debit', amountMinor: caseDebit, currency: settlement.caseCurrency, memo: 'refund from case' },
    {
      account: ACCOUNTS.feeRecovery,
      direction: 'debit',
      amountMinor: refundInCaseCurrency - caseDebit,
      currency: settlement.caseCurrency,
      memo: 'fee recovery reversed',
    },
  ];
  if (settlement.currency !== settlement.caseCurrency) {
    postings.push(
      {
        account: ACCOUNTS.fxPosition(settlement.caseCurrency),
        direction: 'credit',
        amountMinor: refundInCaseCurrency,
        currency: settlement.caseCurrency,
        memo: 'fx conversion out',
      },
      {
        account: ACCOUNTS.fxPosition(settlement.currency),
        direction: 'debit',
        amountMinor: refundChargedMinor,
        currency: settlement.currency,
        memo: 'fx conversion in',
      },
    );
  }
  postings.push({
    account: ACCOUNTS.clearing(settlement.provider),
    direction: 'credit',
    amountMinor: refundChargedMinor,
    currency: settlement.currency,
    memo: 'refund to donor',
  });

  const result = nonZero(postings);
  assertBalanced(result);
  return result;
}

/** Disbursement from a case fund to a hospital, school, creditor… */
export function buildPayoutPostings(caseId: string, amountMinor: number, currency: Currency): Posting[] {
  const postings: Posting[] = [
    { account: ACCOUNTS.caseFund(caseId), direction: 'debit', amountMinor, currency, memo: 'payout to payee' },
    { account: ACCOUNTS.bank, direction: 'credit', amountMinor, currency, memo: 'bank transfer out' },
  ];
  assertBalanced(postings);
  return postings;
}

/** A gateway settles collected funds into the operating bank account. */
export function buildSettlementPostings(provider: PaymentProvider, amountMinor: number, currency: Currency): Posting[] {
  const postings: Posting[] = [
    { account: ACCOUNTS.bank, direction: 'debit', amountMinor, currency, memo: 'settlement received' },
    { account: ACCOUNTS.clearing(provider), direction: 'credit', amountMinor, currency, memo: 'settlement from gateway' },
  ];
  assertBalanced(postings);
  return postings;
}
