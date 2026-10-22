import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBalanced, type Posting } from '@yusr/core';
import { SEED_CASES, seedAmounts } from '@yusr/sdk/mock';
import { AdminQueries } from '../src/admin/admin.queries';
import { CasesService } from '../src/cases/cases.service';
import { FieldCipher } from '../src/common/cipher';
import { ManualClock } from '../src/common/clock';
import { sequentialIds } from '../src/common/ids';
import { MemoryDatabase } from '../src/db/memory';
import { seedDemo, stableId } from '../src/db/seed';
import { DEFAULT_CHECKOUT_WINDOWS, DonationsService } from '../src/donations/donations.service';
import { StaticFx } from '../src/payments/fx';
import { GatewayRegistry } from '../src/payments/registry';

async function seeded() {
  const clock = new ManualClock('2026-09-26T09:00:00Z');
  const db = new MemoryDatabase(() => clock.now());
  const cipher = new FieldCipher(FieldCipher.randomKey());
  let summary = { users: 0, cases: 0, donations: 0, payouts: 0 };
  await db.seed(async (tx) => {
    summary = await seedDemo(tx, { now: clock.now(), cipher });
  });
  const ids = sequentialIds();
  const cases = new CasesService({ db, cipher, clock, ids, config: { nationalIdPepper: 'pepper' } });
  const donations = new DonationsService({
    db,
    gateways: new GatewayRegistry([]),
    fx: new StaticFx(),
    clock,
    ids,
    config: {
      publicApiUrl: 'https://api.yusr.example',
      publicWebUrl: 'https://yusr.example',
      allowedReturnHosts: [],
      appScheme: 'yusr',
      receiptSecret: 's',
      feePolicy: 'case_absorbs',
      checkoutWindowMs: DEFAULT_CHECKOUT_WINDOWS,
    },
  });
  const admin = new AdminQueries({ db, cases, donations, fx: new StaticFx(), clock });
  return { clock, db, cases, admin, summary };
}

const superAdmin = { id: stableId('staff:u_sara'), name: 'Sara', roles: ['super_admin' as const], mfa: true };

describe('demo seed', () => {
  it('loads every story with ledger-backed totals', async () => {
    const { db, summary } = await seeded();
    assert.equal(summary.cases, SEED_CASES.length);
    assert.ok(summary.donations > 300, `${summary.donations} donations`);

    const entries = new Map<string, Posting[]>();
    for (const line of db.journalLines()) entries.set(line.entryId, [...(entries.get(line.entryId) ?? []), line]);
    for (const postings of entries.values()) assertBalanced(postings);

    for (const seed of SEED_CASES) {
      const item = await db.read.cases.bySlug(seed.slug);
      assert.ok(item, seed.slug);
      assert.equal(item.raisedMinor, seedAmounts(seed).raisedMinor, `${seed.slug} raised`);
      assert.equal(item.goalMinor, seedAmounts(seed).goalMinor, `${seed.slug} goal = need + Yusr’s 10%`);
      const funds = await db.read.ledger.caseFund(item.id);
      const raised = funds.reduce((sum, fund) => sum + fund.raisedMinor, 0);
      assert.equal(raised, item.raisedMinor, `${seed.slug} ledger`);
      if (seed.payout === 'paid') {
        const planned = seed.plan.reduce((sum, line) => sum + line.amount * 100, 0);
        assert.equal(funds[0]?.disbursedMinor, planned, `${seed.slug} disbursed`);
        assert.equal(funds[0]?.heldMinor, item.raisedMinor - planned - item.platformFeeMinor, `${seed.slug} keeps nothing back but Yusr’s fee`);
      }
    }
  });

  it('serves the catalog and the control hub from the seeded data', async () => {
    const { cases, admin } = await seeded();
    const page = await cases.list({ limit: 50 });
    assert.equal(page.items.length, SEED_CASES.filter((seed) => seed.status === 'published').length);
    assert.ok(page.items.every((item) => item.status === 'published'));
    const heart = await cases.detail('open-heart-surgery-cairo');
    assert.equal(heart.documents.length, 4);
    assert.ok(heart.timeline.some((event) => event.kind === 'published'));
    assert.equal(heart.disbursements.length, 3);

    const context = { actor: superAdmin };
    const overview = await admin.overview(context);
    assert.equal(overview.kpis.activeCases, page.items.length);
    assert.equal(overview.series.length, 30);
    assert.ok(overview.byMethod.length >= 3);
    assert.ok(overview.activity.length > 0);

    const donors = await admin.donors(context);
    assert.ok(donors.length > 10);
    assert.ok(donors.every((row) => ['major', 'recurring', 'new', 'lapsed'].includes(row.segment)));
    const payouts = await admin.payouts(context);
    assert.ok(payouts.some((row) => row.status === 'paid' && row.approvedBy?.name));
    const audit = await admin.audit(50, context);
    assert.ok(audit.some((entry) => entry.action === 'case.published' && entry.entityLabel.startsWith('YSR-')));
    const volunteers = await admin.volunteers(context);
    assert.ok(volunteers.some((row) => row.casesSubmitted > 0));
    const ledger = await admin.ledger({ limit: 20 }, context);
    assert.equal(ledger.length, 20);
    await assert.rejects(admin.ledger({}, { actor: { ...superAdmin, roles: ['content_moderator'] } }));
  });
});
