import { DomainError } from './errors';
import { ACCOUNTS, assertBalanced, type Posting } from './ledger';
import type { Currency } from './types';

/**
 * Yusr's fee for marketing and collecting a partner's case: 10% added on top of the amount the
 * partner association asks for (VAT included). A case asking 10,000 is published with a goal of
 * 11,000; the 1,000 is Yusr's, the rest is paid out to the case's payees. Gateway fees are separate.
 */
export const PLATFORM_FEE_BPS = 1_000;

/** Yusr's share for a case that needs `needMinor` (rounded to the nearest minor unit). */
export function platformFeeFor(needMinor: number, bps: number = PLATFORM_FEE_BPS): number {
  if (!Number.isInteger(needMinor) || needMinor < 0) throw new RangeError(`needMinor must be a non-negative integer, received ${needMinor}`);
  return Math.round((needMinor * bps) / 10_000);
}

export interface CaseAmounts {
  /** What the partner association asked for: the disbursement plan adds up to this. */
  needMinor: number;
  /** Yusr's share. */
  platformFeeMinor: number;
  /** What donors are asked to give: need + fee. */
  goalMinor: number;
}

/** The goal donors see for a case that needs `needMinor`. */
export function caseAmountsFor(needMinor: number, bps: number = PLATFORM_FEE_BPS): CaseAmounts {
  const platformFeeMinor = platformFeeFor(needMinor, bps);
  return { needMinor, platformFeeMinor, goalMinor: needMinor + platformFeeMinor };
}

/** The part of a case's goal that goes to its payees. */
export function caseNeedMinor(item: { goalMinor: number; platformFeeMinor: number }): number {
  return item.goalMinor - item.platformFeeMinor;
}

/**
 * Moves Yusr's share out of a funded case's fund into revenue. Posted once, when the case is
 * fully funded; the rest of the fund is paid to the payees.
 */
export function buildPlatformFeePostings(caseId: string, feeMinor: number, currency: Currency): Posting[] {
  if (!Number.isInteger(feeMinor) || feeMinor <= 0) throw new DomainError('VALIDATION_FAILED', 'Platform fee must be a positive integer');
  const postings: Posting[] = [
    { account: ACCOUNTS.caseFund(caseId), direction: 'debit', amountMinor: feeMinor, currency, memo: 'Yusr platform fee' },
    { account: ACCOUNTS.platformFees, direction: 'credit', amountMinor: feeMinor, currency, memo: 'platform fee earned' },
  ];
  assertBalanced(postings);
  return postings;
}
