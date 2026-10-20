import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '@yusr/core';
import { CasesService, type SubmissionInput } from '../src/cases/cases.service';
import { VerificationService } from '../src/cases/verification.service';
import { FieldCipher } from '../src/common/cipher';
import { CASE_ID, DRAFT_CASE_ID, USERS, actorOf, setup } from './support/fixtures';

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => DomainError.is(error) && error.code === code);
}

async function setupCases() {
  const context = await setup();
  const cipher = new FieldCipher(FieldCipher.randomKey());
  const cases = new CasesService({ db: context.db, cipher, clock: context.clock, ids: context.ids, config: { nationalIdPepper: 'nid-pepper' } });
  const verification = new VerificationService({ db: context.db, cases, clock: context.clock, ids: context.ids });
  return { ...context, cipher, cases, verification };
}

const submission = (actorId: string, overrides: Partial<SubmissionInput> = {}): SubmissionInput => ({
  category: 'debt_relief',
  submitterRelation: 'volunteer',
  title: { ar: 'سداد دين إيجار لأسرة من أربعة أفراد', en: 'Clear a rent debt for a family of four' },
  story: {
    ar: 'أسرة مكونة من أم وثلاثة أطفال تراكمت عليها ديون الإيجار بعد وفاة الأب، والمالك رفع دعوى طرد. '.repeat(2),
    en: 'A mother and three children fell behind on rent.',
  },
  region: 'EG-GZ',
  currency: 'EGP',
  goalMinor: 18_000_00,
  isUrgent: true,
  deadline: '2026-10-20T00:00:00.000Z',
  documents: [{ kind: 'court_ruling', storageKey: `uploads/${actorId}/ruling.pdf`, sha256: 'a'.repeat(64) }],
  consent: true,
  beneficiary: { pseudonym: { ar: 'أم يوسف', en: 'Um Youssef' }, nationalId: '29001011234567', phone: '+201112223334', householdSize: 4 },
  ...overrides,
});

describe('public catalog', () => {
  it('lists only published cases unless funded ones are requested, and never drafts', async () => {
    const { cases } = await setupCases();
    const page = await cases.list({});
    assert.ok(page.items.every((item) => item.status === 'published'));
    assert.ok(!page.items.some((item) => item.id === DRAFT_CASE_ID));
    await rejects(cases.detail('draft-case'), 'NOT_FOUND');
    const detail = await cases.detail('heart-surgery');
    assert.equal(detail.beneficiary.ar, 'أم سارة، ٣٤');
    assert.equal(JSON.stringify(detail).includes('storageKey'), false);
  });
});

describe('submission portal', () => {
  it('stores the national ID only as a keyed hash and ciphertext, and flags repeats', async () => {
    const { cases, db, cipher } = await setupCases();
    const volunteer = actorOf(USERS.volunteer, false);
    const first = await cases.submit(submission(volunteer.id), { actor: volunteer });
    assert.equal(first.status, 'under_review');
    assert.equal(first.possibleDuplicate, false);

    const stored = await db.read.cases.byId(first.id);
    const beneficiary = await db.read.cases.beneficiary(stored!.beneficiaryId);
    assert.match(beneficiary!.nationalIdHash!, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(beneficiary).includes('29001011234567'), false);
    assert.equal(cipher.decrypt(beneficiary!.nationalIdCipher!, `nid:${beneficiary!.id}`), '29001011234567');
    assert.ok(db.outboxEvents().some((event) => event.type === 'case.submitted'));

    const again = await cases.submit(submission(volunteer.id, { title: { ar: 'طلب آخر لنفس الأسرة بعد أشهر', en: 'Another request' } }), { actor: volunteer });
    assert.equal(again.possibleDuplicate, true);
  });

  it('records the partner association that submitted a case and shows it to staff', async () => {
    const { cases } = await setupCases();
    const volunteer = actorOf(USERS.volunteer, false);
    const association = { name: 'جمعية الخير لتنمية المجتمع', registrationNumber: '1234/2019', contactName: 'سعاد محمود', contactPhone: '+201001234567' };
    const created = await cases.submit(submission(volunteer.id, { submitterRelation: 'association', association }), { actor: volunteer });
    const staff = await cases.adminCase(created.id, { actor: actorOf(USERS.moderator) });
    assert.equal(staff.submittedBy.relation, 'association');
    assert.equal(staff.submittedBy.name, association.name);
    assert.deepEqual(staff.submittedBy.association, association);
    assert.deepEqual(staff.partner, { name: association.name, registrationNumber: association.registrationNumber }, 'the public view names the partner');
    assert.ok(!JSON.stringify(staff.partner).includes(association.contactPhone), 'never its contact');
    assert.equal(staff.timeline[0]?.actor.ar, association.name, 'the association submitted it');
  });

  it('refuses documents uploaded by someone else and anonymous submissions', async () => {
    const { cases } = await setupCases();
    const volunteer = actorOf(USERS.volunteer, false);
    await rejects(
      cases.submit(submission(volunteer.id, { documents: [{ kind: 'invoice', storageKey: 'uploads/someone-else/x.pdf', sha256: 'b'.repeat(64) }] }), {
        actor: volunteer,
      }),
      'FORBIDDEN',
    );
    await rejects(cases.submit(submission(volunteer.id), { actor: null }), 'UNAUTHENTICATED');
  });
});

describe('verification and publishing pipeline', () => {
  it('runs submission → field visit → plan → publish with each role doing only its part', async () => {
    const { cases, verification, db } = await setupCases();
    const volunteer = actorOf(USERS.volunteer, false);
    const moderator = actorOf(USERS.moderator);
    const auditor = actorOf(USERS.auditor);
    const finance = actorOf(USERS.financeA);
    const { id } = await cases.submit(submission(volunteer.id), { actor: volunteer });

    await rejects(verification.assign(id, { auditorId: USERS.auditor.id }, { actor: auditor }), 'FORBIDDEN');
    const task = await verification.assign(id, { auditorId: USERS.auditor.id, visitAt: new Date('2026-09-28T10:00:00Z') }, { actor: moderator });
    assert.equal(task.status, 'scheduled');

    await rejects(cases.transition(id, { to: 'field_verified' }, { actor: auditor }), 'INVALID_TRANSITION');
    await rejects(verification.complete(task.id, { recommendedMinor: 17_500_00 }, { actor: auditor }), 'VALIDATION_FAILED');
    await verification.updateChecklist(task.id, { identity: true, residence: true, documents: true, cost: true, alternatives: true }, { actor: auditor });
    await verification.complete(task.id, { recommendedMinor: 17_500_00, notes: 'Visited; eviction notice confirmed.' }, { actor: auditor });
    const verified = await db.read.cases.byId(id);
    assert.equal(verified?.status, 'field_verified');
    assert.equal(verified?.goalMinor, 17_500_00);

    await rejects(cases.transition(id, { to: 'published' }, { actor: auditor }), 'FORBIDDEN_TRANSITION');
    await rejects(cases.transition(id, { to: 'published' }, { actor: moderator }), 'VALIDATION_FAILED');
    await cases.setDisbursementPlan(
      id,
      [
        {
          payeeType: 'landlord',
          payee: { ar: 'المالك (بموجب الحكم)', en: 'Landlord (per ruling)' },
          purpose: { ar: 'متأخرات الإيجار', en: 'Rent arrears' },
          amountMinor: 15_000_00,
        },
        {
          payeeType: 'creditor',
          payee: { ar: 'محكمة الجيزة', en: 'Giza court' },
          purpose: { ar: 'رسوم التسوية', en: 'Settlement fees' },
          amountMinor: 2_500_00,
        },
      ],
      { actor: moderator },
    );
    await db.transaction(async (tx) => {
      const [document] = await tx.cases.documents(id);
      await tx.cases.insertDocument({
        ...document!,
        id: '00000000-0000-4000-8000-00000000d0c2',
        redactedKey: 'public/ruling-redacted.pdf',
        redactedBy: USERS.moderator.id,
      });
    });
    const published = await cases.transition(id, { to: 'published' }, { actor: moderator });
    assert.equal(published.status, 'published');
    assert.ok(published.publishedAt);

    await rejects(cases.transition(id, { to: 'funded' }, { actor: finance }), 'FORBIDDEN_TRANSITION');
    await rejects(cases.transition(id, { to: 'paused' }, { actor: moderator }), 'REASON_REQUIRED');
    await cases.transition(id, { to: 'paused', reason: 'Family asked to pause while the court reschedules' }, { actor: moderator });

    const history = await db.read.cases.transitions(id);
    assert.deepEqual(
      history.map((row) => row.toStatus),
      ['under_review', 'field_verified', 'published', 'paused'],
    );
    const actions = db
      .auditRows()
      .filter((row) => row.entityId === id)
      .map((row) => row.action);
    assert.deepEqual(actions, ['case.submitted', 'case.goal_adjusted', 'case.field_verified', 'case.plan_set', 'case.published', 'case.paused']);
  });

  it('lets only moderators prioritize and blocks staff without a second factor', async () => {
    const { cases, db } = await setupCases();
    await rejects(cases.prioritize(CASE_ID, 90, { actor: actorOf(USERS.auditor) }), 'FORBIDDEN');
    await rejects(cases.prioritize(CASE_ID, 90, { actor: actorOf(USERS.moderator, false) }), 'FORBIDDEN');
    await cases.prioritize(CASE_ID, 90, { actor: actorOf(USERS.moderator) });
    assert.equal((await db.read.cases.byId(CASE_ID))?.priority, 90);
  });
});
