import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeForSearch, queryCases, sortCases, type CaseSummary } from '../src/index';

function makeCase(overrides: Partial<CaseSummary>): CaseSummary {
  return {
    id: overrides.id ?? 'id',
    slug: 'slug',
    reference: 'YSR-10000',
    category: 'medical',
    status: 'published',
    title: { ar: 'عملية قلب مفتوح لطفلة', en: 'Open-heart surgery for a girl' },
    summary: { ar: 'تحتاج إلى عملية عاجلة في مستشفى جامعي', en: 'Needs urgent surgery' },
    shareText: null,
    region: 'EG-C',
    currency: 'EGP',
    goalMinor: 100_00,
    platformFeeMinor: 0,
    raisedMinor: 50_00,
    donorsCount: 10,
    isUrgent: false,
    deadline: null,
    zakatEligible: true,
    verifiedAt: '2026-09-01T00:00:00Z',
    publishedAt: '2026-09-02T00:00:00Z',
    fundedAt: null,
    priority: 0,
    coverSeed: 1,
    createdAt: '2026-08-30T00:00:00Z',
    ...overrides,
  };
}

describe('search normalization', () => {
  it('ignores harakat, hamza forms and ta marbuta', () => {
    assert.equal(normalizeForSearch('مُسْتَشْفَى'), normalizeForSearch('مستشفي'));
    assert.equal(normalizeForSearch('أيتام'), 'ايتام');
    assert.equal(normalizeForSearch('رعايةٌ'), 'رعايه');
    assert.equal(normalizeForSearch('حالة ١٠٤٨٢'), 'حاله 10482');
  });
});

describe('catalog query', () => {
  const cases = [
    makeCase({ id: 'a', raisedMinor: 90_00, category: 'medical' }),
    makeCase({ id: 'b', raisedMinor: 10_00, category: 'education', region: 'EG-ALX', zakatEligible: false }),
    makeCase({ id: 'c', isUrgent: true, deadline: '2026-10-01T00:00:00Z', category: 'relief' }),
    makeCase({ id: 'd', status: 'funded', raisedMinor: 100_00 }),
    makeCase({ id: 'e', status: 'under_review' }),
    makeCase({ id: 'f', priority: 10 }),
  ];

  it('hides non-public and (by default) funded cases', () => {
    const ids = queryCases(cases).items.map((item) => item.id);
    assert.ok(!ids.includes('d'));
    assert.ok(!ids.includes('e'));
    assert.ok(queryCases(cases, { includeFunded: true }).items.some((item) => item.id === 'd'));
  });

  it('filters by category, region, zakat and completion range', () => {
    assert.deepEqual(
      queryCases(cases, { categories: ['education'] }).items.map((i) => i.id),
      ['b'],
    );
    assert.deepEqual(
      queryCases(cases, { regions: ['EG-ALX'] }).items.map((i) => i.id),
      ['b'],
    );
    assert.ok(!queryCases(cases, { zakatOnly: true }).items.some((i) => i.id === 'b'));
    assert.deepEqual(
      queryCases(cases, { minProgress: 80 }).items.map((i) => i.id),
      ['a'],
    );
  });

  it('searches Arabic text regardless of spelling variants', () => {
    assert.equal(queryCases(cases, { q: 'مستشفي جامعى' }).total, 4);
    assert.equal(queryCases(cases, { q: 'surgery girl' }).total, 4);
    assert.equal(queryCases(cases, { q: 'لا يوجد' }).total, 0);
  });

  it('puts prioritized, then urgent cases first by default', () => {
    const sorted = sortCases(cases.filter((c) => c.status === 'published'));
    assert.equal(sorted[0]?.id, 'f');
    assert.equal(sorted[1]?.id, 'c');
    assert.deepEqual(
      sortCases(
        cases.filter((c) => c.status === 'published'),
        'closest',
      )[0]?.id,
      'a',
    );
  });

  it('paginates with cursors', () => {
    const first = queryCases(cases, { limit: 2 });
    assert.equal(first.items.length, 2);
    assert.equal(first.nextCursor, '2');
    const second = queryCases(cases, { limit: 2, cursor: first.nextCursor });
    assert.equal(second.items.length, 2);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 4);
  });
});
