import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACCOUNTS, DomainError, computeProgress, toMinor, type Actor } from '@yusr/core';
import { SEED_CASES, createMockBackend } from '../src/mock/index';

const NOW = Date.parse('2026-09-26T16:00:00Z');
const make = () => {
  let now = NOW;
  const backend = createMockBackend({ now: () => now });
  return { backend, advance: (ms: number) => (now += ms) };
};

const sara: Actor = { id: 'u_sara', name: 'سارة الشريف', roles: ['super_admin'] };
const heba: Actor = { id: 'u_heba', name: 'هبة فؤاد', roles: ['financial_officer'] };
const karim: Actor = { id: 'u_karim', name: 'كريم سامي', roles: ['financial_officer'] };
const youssef: Actor = { id: 'u_youssef', name: 'يوسف منصور', roles: ['content_moderator'] };
const mahmoud: Actor = { id: 'u_mahmoud', name: 'محمود عبد الحميد', roles: ['field_auditor'] };

describe('seeded demo data', () => {
  const { backend } = make();

  it('builds every case total from individual donations', () => {
    for (const seed of SEED_CASES) {
      const item = backend.read.adminCases().find((entry) => entry.slug === seed.slug)!;
      const target = toMinor(seed.raised, seed.currency);
      const fromDonations = backend.read
        .donations()
        .filter((donation) => donation.caseId === item.id && donation.status === 'succeeded')
        .reduce((sum, donation) => sum + donation.netToCaseMinor, 0);
      assert.equal(item.raisedMinor, fromDonations, `${seed.slug} matches its donations`);
      if (seed.status === 'funded' || seed.status === 'closed') assert.equal(item.raisedMinor, target, seed.slug);
      else assert.ok(item.raisedMinor <= target && target - item.raisedMinor <= Math.max(target * 0.06, 5_000_00), `${seed.slug} near target`);
    }
  });

  it('keeps the ledger balanced in every currency', () => {
    const balance = backend.read.ledgerBalance();
    assert.equal(balance.balanced, true);
    assert.ok(balance.lines > 1_000);
  });

  it('holds exactly the raised amount (minus payouts) in each case fund', () => {
    const balances = backend.read.accountBalances();
    for (const item of backend.read.adminCases()) {
      const fund = balances.find((entry) => entry.account === ACCOUNTS.caseFund(item.id) && entry.currency === item.currency);
      const paidOut = backend.read
        .payouts()
        .filter((p) => p.caseId === item.id && p.status === 'paid')
        .reduce((s, p) => s + p.amountMinor, 0);
      assert.equal((fund?.balanceMinor ?? 0) + paidOut, item.raisedMinor, item.slug);
    }
  });

  it('exposes only public cases in the catalog', () => {
    const page = backend.read.cases({ limit: 50 });
    assert.ok(page.items.every((item) => item.status === 'published'));
    assert.equal(backend.read.caseBySlug('private-car-loan-cairo'), null);
    assert.ok(backend.read.caseBySlug('insulin-pump-ismailia'));
  });

  it('builds a 30-day overview', () => {
    const overview = backend.read.overview();
    assert.equal(overview.series.length, 30);
    assert.ok(overview.kpis.activeCases >= 14);
    assert.equal(overview.kpis.awaitingTransfers, 2);
    assert.ok(overview.byMethod.length >= 4);
  });
});

describe('donation flows', () => {
  it('settles a card donation, posts a balanced entry and emits events', () => {
    const { backend } = make();
    const events: string[] = [];
    backend.subscribe((event) => events.push(event.type));
    const target = backend.read.caseBySlug('prosthetic-leg-minya')!;
    const response = backend.createDonation(
      {
        caseId: target.id,
        amountMinor: 250_00,
        currency: 'EGP',
        method: 'card',
        coverFees: true,
        anonymous: false,
        type: 'zakat',
        locale: 'ar',
        donor: { name: 'منى' },
      },
      { userId: null },
    );
    assert.equal(response.action.type, 'redirect');
    assert.equal(response.breakdown.netToCaseMinor, 250_00);
    backend.completePayment(response.donationId, 'success');
    assert.equal(backend.read.caseBySlug('prosthetic-leg-minya')!.raisedMinor, target.raisedMinor + 250_00);
    assert.equal(backend.read.ledgerBalance().balanced, true);
    assert.deepEqual(events.slice(0, 1), ['donation.created']);
    assert.ok(events.includes('donation.succeeded'));
  });

  it('funds a case automatically when the goal is reached', () => {
    const { backend } = make();
    const target = backend.read.caseBySlug('overdue-rent-eviction-qalyubia')!;
    const remaining = computeProgress(target.raisedMinor, target.goalMinor).remainingMinor;
    const response = backend.createDonation(
      { caseId: target.id, amountMinor: remaining, currency: 'EGP', method: 'card', coverFees: true, anonymous: true, type: 'sadaqah', locale: 'ar' },
      { userId: 'me' },
    );
    backend.completePayment(response.donationId, 'success');
    const after = backend.read.caseBySlug('overdue-rent-eviction-qalyubia')!;
    assert.equal(after.status, 'funded');
    assert.ok(after.timeline.some((event) => event.kind === 'funded'));
    assert.ok(backend.read.myNotifications().some((n) => n.kind === 'funded'));
  });

  it('returns Fawry references and InstaPay instructions for async methods', () => {
    const { backend } = make();
    const target = backend.read.caseBySlug('open-heart-surgery-cairo')!;
    const fawry = backend.createDonation(
      { caseId: target.id, amountMinor: 100_00, currency: 'EGP', method: 'fawry', coverFees: false, anonymous: false, type: 'sadaqah', locale: 'ar' },
      { userId: 'me' },
    );
    assert.equal(fawry.action.type, 'fawry_reference');
    const instapay = backend.createDonation(
      { caseId: target.id, amountMinor: 100_00, currency: 'EGP', method: 'instapay', coverFees: false, anonymous: false, type: 'sadaqah', locale: 'ar' },
      { userId: 'me' },
    );
    assert.equal(instapay.status, 'awaiting_transfer');
    assert.equal(instapay.action.type, 'bank_transfer');
  });

  it('enforces donation rules', () => {
    const { backend } = make();
    const school = backend.read.caseBySlug('engineering-student-laptop-asyut')!;
    assert.throws(
      () =>
        backend.createDonation({
          caseId: school.id,
          amountMinor: 100_00,
          currency: 'EGP',
          method: 'card',
          coverFees: false,
          anonymous: false,
          type: 'zakat',
          locale: 'ar',
        }),
      (error) => DomainError.is(error, 'ZAKAT_NOT_ELIGIBLE'),
    );
  });
});

describe('operations (RBAC + maker-checker)', () => {
  it('lets finance confirm an InstaPay transfer', async () => {
    const { backend } = make();
    const pending = backend.read.donations({ status: 'awaiting_transfer' })[0]!;
    await assert.rejects(backend.admin(heba).confirmTransfer(pending.id, 'CIB-7781203', pending.chargedMinor - 100), (e) =>
      DomainError.is(e, 'AMOUNT_MISMATCH'),
    );
    await backend.admin(heba).confirmTransfer(pending.id, 'CIB-7781203', pending.chargedMinor);
    assert.equal(backend.read.donation(pending.id)!.status, 'succeeded');
    assert.ok(backend.read.audit(5).some((entry) => entry.action === 'donation.transfer_confirmed'));
  });

  it('blocks moderators from money and auditors from publishing', async () => {
    const { backend } = make();
    const pending = backend.read.donations({ status: 'awaiting_transfer' })[0]!;
    await assert.rejects(backend.admin(youssef).confirmTransfer(pending.id, 'X-1001', pending.chargedMinor), (e) => DomainError.is(e, 'FORBIDDEN'));
    const ready = backend.read.adminCases().find((item) => item.status === 'field_verified')!;
    await assert.rejects(backend.admin(mahmoud).transitionCase(ready.id, 'published'), (e) => DomainError.is(e, 'FORBIDDEN_TRANSITION'));
    const published = await backend.admin(youssef).transitionCase(ready.id, 'published');
    assert.equal(published.status, 'published');
    assert.ok(backend.read.caseBySlug(ready.slug));
  });

  it('requires a second officer to approve refunds and payouts', async () => {
    const { backend } = make();
    const refund = backend.read.refunds().find((entry) => entry.status === 'requested')!;
    await assert.rejects(backend.admin(heba).approveRefund(refund.id), (e) => DomainError.is(e, 'SELF_APPROVAL_FORBIDDEN'));
    await backend.admin(karim).approveRefund(refund.id);
    assert.equal(backend.read.ledgerBalance().balanced, true);

    const heart = backend.read.adminCases().find((item) => item.slug === 'open-heart-surgery-cairo')!;
    const payout = await backend.admin(heba).requestPayout(heart.id, heart.disbursements[1]!.id);
    await assert.rejects(backend.admin(heba).approvePayout(payout.id), (e) => DomainError.is(e, 'SELF_APPROVAL_FORBIDDEN'));
    await backend.admin(karim).approvePayout(payout.id);
    await assert.rejects(backend.admin(heba).markPayoutPaid(payout.id, ''), (e) => DomainError.is(e, 'VALIDATION_FAILED'));
    const paid = await backend.admin(heba).markPayoutPaid(payout.id, 'CIB-TRX-55120');
    assert.equal(paid.status, 'paid');
    const detail = backend.read.caseBySlug('open-heart-surgery-cairo')!;
    assert.equal(detail.disbursements[1]!.status, 'paid');
    assert.ok(backend.read.myNotifications().some((n) => n.kind === 'disbursed'));
    assert.equal(backend.read.ledgerBalance().balanced, true);
  });

  it('refuses a payout larger than the case fund', async () => {
    const { backend } = make();
    const implant = backend.read.adminCases().find((item) => item.slug === 'cochlear-implant-port-said')!;
    await assert.rejects(backend.admin(heba).requestPayout(implant.id, implant.disbursements[0]!.id), (e) => DomainError.is(e, 'INSUFFICIENT_CASE_FUNDS'));
  });

  it('walks a case through field verification', async () => {
    const { backend } = make();
    const task = backend.read.tasks().find((entry) => entry.status !== 'completed')!;
    const admin = backend.admin(mahmoud);
    for (const item of ['identity', 'residence', 'documents', 'cost', 'alternatives'] as const) {
      await admin.updateChecklist(task.id, item, true);
    }
    const verified = await admin.completeVerification(task.id, 18_000_00, 'تمت الزيارة');
    assert.equal(verified.status, 'field_verified');
  });

  it('simulates live donations', () => {
    const { backend } = make();
    const before = backend.read.live(1)[0]!.id;
    const donation = backend.simulate.tick();
    assert.ok(donation);
    assert.notEqual(backend.read.live(1)[0]!.id, before);
    assert.equal(backend.read.ledgerBalance().balanced, true);
  });

  it('lets a super admin do everything', async () => {
    const { backend } = make();
    const overview = await backend.admin(sara).overview();
    assert.ok(overview.kpis.activeCases > 0);
    const audit = await backend.admin(sara).audit(10);
    assert.equal(audit.length, 10);
  });
});

describe('case submission', () => {
  const story = 'تحتاج الأسرة إلى دعم عاجل لتغطية تكاليف العلاج الشهرية بعد توقف دخل الأب عن العمل منذ شهور. '.repeat(2);

  it('uploads documents first, then submits them by key', async () => {
    const { backend } = make();
    const ticket = await backend.client.presignUpload({ kind: 'medical_report', contentType: 'application/pdf', sizeBytes: 240_000 });
    assert.match(ticket.key, /^uploads\/.+\.pdf$/);
    assert.equal(ticket.headers['content-type'], 'application/pdf');
    await assert.rejects(backend.client.presignUpload({ kind: 'medical_report', contentType: 'application/zip', sizeBytes: 10 }), (e) =>
      DomainError.is(e, 'VALIDATION_FAILED'),
    );

    const request = {
      category: 'medical' as const,
      submitterRelation: 'volunteer' as const,
      title: { ar: 'علاج شهري لأب مريض بالكلى' },
      story: { ar: story },
      region: 'EG-C',
      currency: 'EGP' as const,
      goalMinor: 45_000_00,
      isUrgent: false,
      deadline: null,
      beneficiary: { pseudonym: { ar: 'أبو سالم' }, nationalId: '28801011234567' },
      documents: [{ kind: 'medical_report' as const, storageKey: ticket.key, sha256: 'b'.repeat(64) }],
      consent: true as const,
    };
    const first = await backend.client.submitCase(request);
    assert.equal(first.status, 'under_review');
    assert.equal(first.possibleDuplicate, false);
    const created = backend.read.adminCases().find((item) => item.id === first.id)!;
    assert.equal(created.beneficiary.ar, 'أبو سالم');
    assert.equal(created.title.en, created.title.ar, 'missing translation falls back to the submitted text');

    const again = await backend.client.submitCase(request);
    assert.equal(again.possibleDuplicate, true, 'same national ID is flagged for reviewers');
    await assert.rejects(
      backend.client.submitCase({ ...request, documents: [{ kind: 'medical_report', storageKey: 'uploads/someone-else/x.pdf', sha256: 'c'.repeat(64) }] }),
      (e) => DomainError.is(e, 'FORBIDDEN'),
    );
  });
});
