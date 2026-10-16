import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEMO_FX, allocateMinor, computeCountdown, computeProgress, convertMinor, fromMinor, parseAmountInput, toMinor } from '../src/index';

describe('money', () => {
  it('converts between major and minor units without float drift', () => {
    assert.equal(toMinor(1.005, 'EGP'), 101);
    assert.equal(toMinor(19.99, 'USD'), 1999);
    assert.equal(toMinor(250, 'SAR'), 25_000);
    assert.equal(fromMinor(12_345, 'EGP'), 123.45);
  });

  it('converts across currencies using the locked FX table', () => {
    assert.equal(convertMinor(100_00, 'USD', 'EGP', DEMO_FX), 5_045_00);
    assert.equal(convertMinor(5_045_00, 'EGP', 'USD', DEMO_FX), 100_00);
    assert.equal(convertMinor(777, 'EGP', 'EGP', DEMO_FX), 777);
  });

  it('parses amounts typed with Arabic-Indic digits and separators', () => {
    assert.equal(parseAmountInput('٢٥٠'), 250);
    assert.equal(parseAmountInput('١٬٥٠٠'), 1500);
    assert.equal(parseAmountInput('١٢٫٥'), 12.5);
    assert.equal(parseAmountInput(' 1,250.75 '), 1250.75);
    assert.equal(parseAmountInput('۳۰۰'), 300);
    assert.equal(parseAmountInput('0'), null);
    assert.equal(parseAmountInput('-5'), null);
    assert.equal(parseAmountInput('12.345'), null);
    assert.equal(parseAmountInput('abc'), null);
  });

  it('allocates totals exactly with the largest-remainder method', () => {
    assert.deepEqual(allocateMinor(100, [1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(allocateMinor(185_000_00, [60, 25, 15]), [111_000_00, 46_250_00, 27_750_00]);
    for (let i = 0; i < 200; i += 1) {
      const total = Math.floor(Math.random() * 10_000_000);
      const weights = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () => Math.random() * 10 + 0.01);
      const parts = allocateMinor(total, weights);
      assert.equal(
        parts.reduce((a, b) => a + b, 0),
        total,
      );
      assert.ok(parts.every((part) => Number.isInteger(part) && part >= 0));
    }
  });
});

describe('progress', () => {
  it('computes ratio, remaining and tone', () => {
    const progress = computeProgress(142_300_00, 185_000_00);
    assert.equal(progress.percent, 76);
    assert.equal(progress.remainingMinor, 42_700_00);
    assert.equal(progress.tone, 'building');
    assert.equal(progress.isFunded, false);
  });

  it('never shows 0% for a case with donations or 100% before the goal', () => {
    assert.equal(computeProgress(1, 1_000_000).percent, 1);
    assert.equal(computeProgress(0, 1_000_000).percent, 0);
    assert.equal(computeProgress(999_999, 1_000_000).percent, 99);
    assert.equal(computeProgress(1_000_000, 1_000_000).percent, 100);
  });

  it('reports overfunding and clamps the ratio', () => {
    const progress = computeProgress(1_250, 1_000);
    assert.equal(progress.ratio, 1);
    assert.equal(progress.overfundedMinor, 250);
    assert.equal(progress.tone, 'funded');
  });

  it('uses the "close" tone from 80%', () => {
    assert.equal(computeProgress(80, 100).tone, 'close');
    assert.equal(computeProgress(24, 100).tone, 'start');
  });

  it('rejects a non-positive goal', () => {
    assert.throws(() => computeProgress(10, 0), RangeError);
  });
});

describe('countdown', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');

  it('breaks the remaining time into parts', () => {
    const countdown = computeCountdown('2026-09-28T15:30:05Z', now);
    assert.ok(countdown);
    assert.deepEqual(
      { days: countdown.days, hours: countdown.hours, minutes: countdown.minutes, seconds: countdown.seconds },
      { days: 2, hours: 3, minutes: 30, seconds: 5 },
    );
    assert.equal(countdown.level, 'soon');
  });

  it('flags critical deadlines and expiry', () => {
    assert.equal(computeCountdown('2026-09-27T12:00:00Z', now)?.level, 'critical');
    assert.equal(computeCountdown('2026-09-20T12:00:00Z', now)?.expired, true);
    assert.equal(computeCountdown(null, now), null);
  });
});
