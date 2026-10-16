import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNTS,
  DEFAULT_FEES,
  DEMO_FX,
  DomainError,
  assertBalanced,
  assertDonationAllowed,
  balanceOf,
  buildDonationPostings,
  buildPayoutPostings,
  buildRefundPostings,
  buildSettlementPostings,
  computeDonationBreakdown,
  feeFor,
  grossUpForFee,
  methodsForCurrency,
  resolveProvider,
  type DonationSettlement,
  type FeeRule,
  type Posting,
} from '../src/index';

describe('payment routing', () => {
  it('routes each method/currency to its gateway', () => {
    assert.equal(resolveProvider('card', 'EGP'), 'paymob');
    assert.equal(resolveProvider('card', 'USD'), 'stripe');
    assert.equal(resolveProvider('mada', 'SAR'), 'moyasar');
    assert.equal(resolveProvider('fawry', 'EGP'), 'fawry');
    assert.equal(resolveProvider('mada', 'EGP'), null);
    assert.equal(resolveProvider('vodafone_cash', 'USD'), null);
  });

  it('lists the methods offered per currency', () => {
    assert.deepEqual(methodsForCurrency('SAR'), ['mada', 'apple_pay', 'card']);
    assert.ok(methodsForCurrency('EGP').includes('instapay'));
    assert.ok(!methodsForCurrency('USD').includes('fawry'));
  });
});

describe('fees', () => {
  const paymobCard = DEFAULT_FEES.paymob.card as FeeRule;

  it('applies percentage, fixed part and minimums', () => {
    assert.equal(feeFor(100_00, paymobCard), 575);
    assert.equal(feeFor(10_00, DEFAULT_FEES.fawry.fawry as FeeRule), 500);
    assert.equal(feeFor(0, paymobCard), 0);
  });

  it('grosses up to the smallest charge that leaves the full amount', () => {
    const rules = Object.values(DEFAULT_FEES).flatMap((methods) => Object.values(methods)) as FeeRule[];
    for (const rule of rules) {
      for (let i = 0; i < 300; i += 1) {
        const net = 100 + Math.floor(Math.random() * 5_000_000);
        const charge = grossUpForFee(net, rule);
        assert.ok(charge - feeFor(charge, rule) >= net, 'covers the amount');
        assert.ok(charge - 1 - feeFor(charge - 1, rule) < net, 'is minimal');
      }
    }
  });
});

describe('donation breakdown', () => {
  it('deducts the estimated fee from the case when the donor does not cover it', () => {
    const breakdown = computeDonationBreakdown({
      amountMinor: 100_00,
      currency: 'EGP',
      method: 'card',
      coverFees: false,
      caseCurrency: 'EGP',
    });
    assert.equal(breakdown.provider, 'paymob');
    assert.equal(breakdown.chargedMinor, 100_00);
    assert.equal(breakdown.estimatedFeeMinor, 575);
    assert.equal(breakdown.netToCaseMinor, 94_25);
  });

  it('charges the fee on top when the donor covers it', () => {
    const breakdown = computeDonationBreakdown({
      amountMinor: 100_00,
      currency: 'EGP',
      method: 'card',
      coverFees: true,
      caseCurrency: 'EGP',
    });
    assert.equal(breakdown.netToCaseMinor, 100_00);
    assert.equal(breakdown.chargedMinor - breakdown.estimatedFeeMinor >= 100_00, true);
    assert.equal(breakdown.donorCoveredFeeMinor, breakdown.chargedMinor - 100_00);
  });

  it('converts international donations into the case currency', () => {
    const breakdown = computeDonationBreakdown({
      amountMinor: 50_00,
      currency: 'USD',
      method: 'card',
      coverFees: true,
      caseCurrency: 'EGP',
      fx: DEMO_FX,
    });
    assert.equal(breakdown.provider, 'stripe');
    assert.equal(breakdown.netToCaseMinor, 2_522_50);
    assert.ok(Math.abs(breakdown.fxRate - 50.45) < 1e-9);
  });

  it('enforces donation rules', () => {
    const request = { amountMinor: 500, currency: 'EGP' as const, method: 'card' as const, type: 'sadaqah' as const };
    const context = { caseStatus: 'published' as const, caseZakatEligible: false, isGuest: true };
    assert.throws(
      () => assertDonationAllowed(request, context),
      (e) => DomainError.is(e, 'AMOUNT_TOO_LOW'),
    );
    assert.throws(
      () => assertDonationAllowed({ ...request, amountMinor: 60_000_00 }, context),
      (e) => DomainError.is(e, 'AMOUNT_TOO_HIGH_FOR_GUEST'),
    );
    assert.throws(
      () => assertDonationAllowed({ ...request, amountMinor: 100_00, type: 'zakat' }, context),
      (e) => DomainError.is(e, 'ZAKAT_NOT_ELIGIBLE'),
    );
    assert.throws(
      () => assertDonationAllowed({ ...request, amountMinor: 100_00 }, { ...context, caseStatus: 'paused' }),
      (e) => DomainError.is(e, 'CASE_NOT_DONATABLE'),
    );
    assert.throws(
      () => assertDonationAllowed({ ...request, amountMinor: 100_00, method: 'mada' }, context),
      (e) => DomainError.is(e, 'METHOD_NOT_AVAILABLE'),
    );
    assert.doesNotThrow(() => assertDonationAllowed({ ...request, amountMinor: 100_00 }, context));
  });
});

describe('ledger', () => {
  const sameCurrency: DonationSettlement = {
    caseId: 'case-1',
    provider: 'paymob',
    currency: 'EGP',
    chargedMinor: 100_00,
    feeMinor: 575,
    caseCurrency: 'EGP',
    netToCaseMinor: 94_25,
    fxRate: 1,
  };

  it('posts a balanced donation and credits the case', () => {
    const postings = buildDonationPostings(sameCurrency);
    assertBalanced(postings);
    assert.equal(balanceOf(ACCOUNTS.caseFund('case-1'), postings), 94_25);
    assert.equal(balanceOf(ACCOUNTS.clearing('paymob'), postings), 94_25);
    assert.equal(balanceOf(ACCOUNTS.gatewayFees, postings), 575);
    assert.equal(balanceOf(ACCOUNTS.feeRecovery, postings), 575);
  });

  it('balances each currency independently for international donations', () => {
    const postings = buildDonationPostings({
      caseId: 'case-2',
      provider: 'stripe',
      currency: 'USD',
      chargedMinor: 52_07,
      feeMinor: 181,
      caseCurrency: 'EGP',
      netToCaseMinor: 2_522_50,
      fxRate: 50.45,
    });
    assertBalanced(postings);
    assert.equal(balanceOf(ACCOUNTS.caseFund('case-2'), postings, 'EGP'), 2_522_50);
    assert.equal(balanceOf(ACCOUNTS.clearing('stripe'), postings, 'USD'), 50_26);
  });

  it('reverses case credit on refund while the gateway fee stays expensed', () => {
    const donation = buildDonationPostings(sameCurrency);
    const refund = buildRefundPostings(sameCurrency, 100_00);
    const all: Posting[] = [...donation, ...refund];
    assertBalanced(all);
    assert.equal(balanceOf(ACCOUNTS.caseFund('case-1'), all), 0);
    assert.equal(balanceOf(ACCOUNTS.feeRecovery, all), 0);
    assert.equal(balanceOf(ACCOUNTS.gatewayFees, all), 575);
    assert.equal(balanceOf(ACCOUNTS.clearing('paymob'), all), -575);
  });

  it('supports partial refunds and rejects over-refunds', () => {
    const refund = buildRefundPostings(sameCurrency, 40_00);
    assertBalanced(refund);
    assert.throws(
      () => buildRefundPostings(sameCurrency, 100_01),
      (e) => DomainError.is(e, 'REFUND_EXCEEDS_DONATION'),
    );
  });

  it('stays balanced across thousands of random settlements', () => {
    const providers = ['paymob', 'stripe', 'moyasar', 'fawry', 'instapay'] as const;
    const currencies = ['EGP', 'SAR', 'USD'] as const;
    for (let i = 0; i < 2_000; i += 1) {
      const currency = currencies[i % 3]!;
      const caseCurrency = currencies[(i * 7) % 3]!;
      const charged = 100 + Math.floor(Math.random() * 10_000_000);
      const fee = Math.floor(charged * Math.random() * 0.05);
      const rate = currency === caseCurrency ? 1 : DEMO_FX.rates[currency] / DEMO_FX.rates[caseCurrency];
      const converted = currency === caseCurrency ? charged : Math.round(charged * rate);
      const settlement: DonationSettlement = {
        caseId: `case-${i}`,
        provider: providers[i % providers.length]!,
        currency,
        chargedMinor: charged,
        feeMinor: fee,
        caseCurrency,
        netToCaseMinor: Math.floor(converted * (0.9 + Math.random() * 0.1)),
        fxRate: rate,
      };
      const donation = buildDonationPostings(settlement);
      const refund = buildRefundPostings(settlement, 1 + Math.floor(Math.random() * charged));
      assertBalanced([...donation, ...refund]);
    }
  });

  it('posts payouts and gateway settlements', () => {
    const payout = buildPayoutPostings('case-1', 50_00, 'EGP');
    const settlement = buildSettlementPostings('paymob', 94_25, 'EGP');
    const all = [...buildDonationPostings(sameCurrency), ...settlement, ...payout];
    assertBalanced(all);
    assert.equal(balanceOf(ACCOUNTS.caseFund('case-1'), all), 44_25);
    assert.equal(balanceOf(ACCOUNTS.bank, all), 44_25);
    assert.equal(balanceOf(ACCOUNTS.clearing('paymob'), all), 0);
  });
});
