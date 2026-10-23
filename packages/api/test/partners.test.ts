/**
 * The approved-partner registry and «كود يُسر»: who may manage it, how codes are issued and checked,
 * and how an association submits a case and its documents with its code and no account.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError, isYusrCode, type Partner } from '@yusr/core';
import type { CreatePartnerInput } from '@yusr/core/schemas';
import { CasesService, type SubmissionInput } from '../src/cases/cases.service';
import { FieldCipher } from '../src/common/cipher';
import { MemoryKv } from '../src/common/kv';
import { RateLimiter } from '../src/common/rate-limit';
import { DocumentsService } from '../src/documents/documents.service';
import { DevStorage } from '../src/documents/storage';
import { PartnersService } from '../src/partners/partners.service';
import { USERS, actorOf, setup } from './support/fixtures';

async function rejects(promise: Promise<unknown>, code: string, check?: (error: DomainError) => void) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(DomainError.is(error), String(error));
    assert.equal(error.code, code);
    check?.(error);
    return true;
  });
}

const moderator = actorOf(USERS.moderator);
const superAdmin = { id: '00000000-0000-4000-8000-0000000000ad', name: 'Admin', roles: ['super_admin' as const], mfa: true };

const newPartner = (overrides: Partial<CreatePartnerInput> = {}): CreatePartnerInput => ({
  name: 'جمعية الأمل الخيرية',
  registrationNumber: '4521/2018',
  region: 'EG-GZ',
  contractSignedOn: '2026-09-01',
  contactName: 'سعاد محمود',
  contactPhone: '+201001234567',
  ...overrides,
});

async function setupPartners(randomBytes?: (count: number) => Uint8Array) {
  const context = await setup();
  const cipher = new FieldCipher(FieldCipher.randomKey());
  const limiter = new RateLimiter(new MemoryKv(context.clock));
  const partners = new PartnersService({
    db: context.db,
    cipher,
    clock: context.clock,
    ids: context.ids,
    limiter,
    config: { codePepper: 'code-pepper' },
    ...(randomBytes ? { randomBytes } : {}),
  });
  const cases = new CasesService({ db: context.db, cipher, clock: context.clock, ids: context.ids, partners, config: { nationalIdPepper: 'nid' } });
  const storage = new DevStorage('http://localhost:4000', { now: () => context.clock.now().getTime() });
  const documents = new DocumentsService({ db: context.db, storage, limiter, clock: context.clock, ids: context.ids, partners });
  return { ...context, cipher, partners, cases, documents };
}

const submission = (
  partner: Pick<Partner, 'registrationNumber' | 'yusrCode'>,
  storageKey: string,
  overrides: Partial<SubmissionInput> = {},
): SubmissionInput => ({
  category: 'medical',
  submitterRelation: 'association',
  association: { registrationNumber: partner.registrationNumber, yusrCode: partner.yusrCode, contactName: 'منى سعيد', contactPhone: '+201007654321' },
  title: { ar: 'جلسات علاج طبيعي لطفل بعد حادث' },
  story: { ar: 'يحتاج الطفل إلى جلسات علاج طبيعي منتظمة بعد كسر في الحوض، والأسرة لا تستطيع تحمل التكلفة الشهرية. '.repeat(2) },
  region: 'EG-GZ',
  currency: 'EGP',
  goalMinor: 12_000_00,
  isUrgent: false,
  deadline: null,
  beneficiary: {},
  documents: [{ kind: 'medical_report', storageKey, sha256: 'c'.repeat(64) }],
  consent: true,
  ...overrides,
});

describe('approved-partner registry', () => {
  it('is managed by content moderators and super admins only, with two-factor', async () => {
    const { partners } = await setupPartners();
    for (const user of [USERS.donor, USERS.volunteer, USERS.auditor, USERS.financeA]) {
      await rejects(partners.create(newPartner(), { actor: actorOf(user) }), 'FORBIDDEN');
      await rejects(partners.list({ actor: actorOf(user) }), 'FORBIDDEN');
    }
    await rejects(partners.create(newPartner(), { actor: actorOf(USERS.moderator, false) }), 'FORBIDDEN', (error) =>
      assert.equal(error.details?.['mfaRequired'], true),
    );
    await rejects(partners.list({ actor: null }), 'FORBIDDEN');

    const created = await partners.create(newPartner(), { actor: moderator });
    assert.equal(created.status, 'active');
    assert.ok(isYusrCode(created.yusrCode), created.yusrCode);
    assert.equal(created.createdBy.name, USERS.moderator.displayName);
    const byAdmin = await partners.create(newPartner({ registrationNumber: '٧٧/٢٠٢٠', name: 'جمعية النور' }), { actor: superAdmin });
    assert.equal(byAdmin.registrationNumber, '٧٧/٢٠٢٠', 'the schema normalizes; the service stores what it is given');
    assert.equal((await partners.list({ actor: moderator })).length, 2);
  });

  it('issues unique codes, refuses a duplicate رقم الإشهار and a future contract date', async () => {
    const { partners, db } = await setupPartners();
    const codes = new Set<string>();
    for (let index = 0; index < 25; index += 1) {
      codes.add((await partners.create(newPartner({ registrationNumber: `${100 + index}/2020` }), { actor: moderator })).yusrCode);
    }
    assert.equal(codes.size, 25);
    await rejects(partners.create(newPartner({ registrationNumber: '100/2020' }), { actor: moderator }), 'VALIDATION_FAILED', (error) =>
      assert.equal(error.details?.['field'], 'registrationNumber'),
    );
    await rejects(partners.create(newPartner({ registrationNumber: '999/2020', contractSignedOn: '2027-01-01' }), { actor: moderator }), 'VALIDATION_FAILED');
    const stored = await db.read.partners.list();
    assert.ok(
      stored.every((row) => !JSON.stringify(row).includes('YSR-')),
      'the code is stored only as a hash and ciphertext',
    );
  });

  it('draws again when a generated code is already taken', async () => {
    // The first two partners get the same bytes; the second must not reuse the first one's code.
    let call = 0;
    const sequence = [0, 0, 1];
    const { partners } = await setupPartners((count) => new Uint8Array(count).fill(sequence[Math.min(call++, sequence.length - 1)]!));
    const first = await partners.create(newPartner(), { actor: moderator });
    const second = await partners.create(newPartner({ registrationNumber: '2/2021' }), { actor: moderator });
    assert.notEqual(first.yusrCode, second.yusrCode);
  });

  it('suspends, reactivates and regenerates codes, and audits each step without the code or the phone', async () => {
    const { partners, db } = await setupPartners();
    const created = await partners.create(newPartner(), { actor: moderator });
    const regenerated = await partners.regenerateCode(created.id, { actor: moderator });
    assert.notEqual(regenerated.yusrCode, created.yusrCode);
    await rejects(partners.verify({ registrationNumber: created.registrationNumber, yusrCode: created.yusrCode }, {}), 'VALIDATION_FAILED');
    assert.equal((await partners.verify({ registrationNumber: created.registrationNumber, yusrCode: regenerated.yusrCode }, {})).id, created.id);

    const suspended = await partners.setStatus(created.id, 'suspended', 'Contract under review', { actor: moderator });
    assert.equal(suspended.status, 'suspended');
    await rejects(partners.verify({ registrationNumber: created.registrationNumber, yusrCode: regenerated.yusrCode }, {}), 'VALIDATION_FAILED');
    assert.equal((await partners.setStatus(created.id, 'active', null, { actor: moderator })).status, 'active');
    await partners.update(created.id, { contactPhone: '+201009998877', name: 'جمعية الأمل للتنمية' }, { actor: moderator });
    await rejects(partners.regenerateCode(created.id, { actor: actorOf(USERS.financeA) }), 'FORBIDDEN');

    const trail = db.auditRows().filter((row) => row.entityType === 'partner');
    assert.deepEqual(
      trail.map((row) => row.action),
      ['partner.created', 'partner.code_regenerated', 'partner.suspended', 'partner.reactivated', 'partner.updated'],
    );
    const logged = JSON.stringify(trail);
    assert.ok(!logged.includes(created.yusrCode) && !logged.includes(regenerated.yusrCode), 'codes are never logged');
    assert.ok(!logged.includes('+201009998877') && !logged.includes('+201001234567'), 'nor the contact’s phone');
  });

  it('answers an unknown number, a wrong code and a suspended partner the same way, and rate-limits guessing', async () => {
    const { partners } = await setupPartners();
    const created = await partners.create(newPartner(), { actor: moderator });
    const field = (error: DomainError) => assert.equal(error.details?.['field'], 'association.yusrCode');
    await rejects(partners.verify({ registrationNumber: '0000/0000', yusrCode: created.yusrCode }, { ip: '10.0.0.1' }), 'VALIDATION_FAILED', field);
    await rejects(
      partners.verify({ registrationNumber: created.registrationNumber, yusrCode: 'YSR-AAAAAAAA' }, { ip: '10.0.0.1' }),
      'VALIDATION_FAILED',
      field,
    );
    for (let attempt = 0; attempt < 18; attempt += 1) {
      await rejects(partners.verify({ registrationNumber: created.registrationNumber, yusrCode: 'YSR-AAAAAAAA' }, { ip: '10.0.0.1' }), 'VALIDATION_FAILED');
    }
    await rejects(partners.verify({ registrationNumber: created.registrationNumber, yusrCode: 'YSR-AAAAAAAA' }, { ip: '10.0.0.1' }), 'RATE_LIMITED');
    assert.equal((await partners.verify({ registrationNumber: created.registrationNumber, yusrCode: created.yusrCode }, { ip: '10.0.0.2' })).id, created.id);
  });
});

describe('association submissions with «كود يُسر»', () => {
  it('uploads and submits without an account; the case names the partner from the registry', async () => {
    const { partners, documents, cases, db } = await setupPartners();
    const partner = await partners.create(newPartner(), { actor: moderator });
    const credentials = { registrationNumber: partner.registrationNumber, yusrCode: partner.yusrCode };
    await rejects(documents.presignUpload({ kind: 'medical_report', contentType: 'application/pdf', sizeBytes: 1_000 }, { actor: null }), 'UNAUTHENTICATED');
    const ticket = await documents.presignUpload(
      { kind: 'medical_report', contentType: 'application/pdf', sizeBytes: 1_000, association: credentials },
      { actor: null },
    );
    assert.ok(ticket.key.startsWith(`uploads/partner-${partner.id}/`), ticket.key);

    const created = await cases.submit(submission(partner, ticket.key), { actor: null, ip: '10.0.0.9' });
    const row = await db.read.cases.byId(created.id);
    assert.equal(row?.partnerId, partner.id);
    assert.equal(row?.submittedBy, null, 'no account was needed');
    assert.deepEqual(row?.association, {
      name: partner.name,
      registrationNumber: partner.registrationNumber,
      contactName: 'منى سعيد',
      contactPhone: '+201007654321',
    });
    const staff = await cases.adminCase(created.id, { actor: moderator });
    assert.equal(staff.history[0]?.actorName, partner.name, 'the history names the partner');
    assert.equal((await partners.list({ actor: moderator }))[0]?.casesCount, 1);

    // Renaming the partner in the registry renames it on its cases.
    await partners.update(partner.id, { name: 'جمعية الأمل للتنمية' }, { actor: moderator });
    assert.equal((await db.read.cases.byId(created.id))?.association?.name, 'جمعية الأمل للتنمية');
  });

  it('refuses a wrong or suspended code, and documents from another uploader', async () => {
    const { partners, documents, cases } = await setupPartners();
    const partner = await partners.create(newPartner(), { actor: moderator });
    const other = await partners.create(newPartner({ registrationNumber: '9/2022', name: 'جمعية أخرى' }), { actor: moderator });
    const key = `uploads/partner-${partner.id}/report.pdf`;
    const field = (error: DomainError) => assert.equal(error.details?.['field'], 'association.yusrCode');

    await rejects(cases.submit(submission({ ...partner, yusrCode: other.yusrCode }, key), { actor: null }), 'VALIDATION_FAILED', field);
    await rejects(cases.submit(submission(partner, `uploads/partner-${other.id}/report.pdf`), { actor: null }), 'FORBIDDEN');
    await rejects(cases.submit(submission(partner, `uploads/${USERS.volunteer.id}/report.pdf`), { actor: null }), 'FORBIDDEN');
    await rejects(cases.submit(submission(partner, `uploads/partner-${partner.id}/../x.pdf`), { actor: null }), 'FORBIDDEN');
    await rejects(cases.submit(submission(partner, key, { association: null }), { actor: actorOf(USERS.volunteer) }), 'VALIDATION_FAILED');

    await partners.setStatus(partner.id, 'suspended', null, { actor: moderator });
    await rejects(cases.submit(submission(partner, key), { actor: null }), 'VALIDATION_FAILED', field);
    await rejects(
      documents.presignUpload(
        {
          kind: 'medical_report',
          contentType: 'application/pdf',
          sizeBytes: 10,
          association: { registrationNumber: partner.registrationNumber, yusrCode: partner.yusrCode },
        },
        { actor: null },
      ),
      'VALIDATION_FAILED',
      field,
    );
    // A signed-in person submitting for an association still needs the partner's valid code.
    await rejects(cases.submit(submission(partner, `uploads/${USERS.volunteer.id}/r.pdf`), { actor: actorOf(USERS.volunteer) }), 'VALIDATION_FAILED');
    // Other relations keep working for signed-in people only.
    const own = submission(partner, `uploads/${USERS.volunteer.id}/r.pdf`, { submitterRelation: 'volunteer', association: null });
    assert.equal((await cases.submit(own, { actor: actorOf(USERS.volunteer) })).status, 'under_review');
    await rejects(cases.submit(own, { actor: null }), 'UNAUTHENTICATED');
  });
});
