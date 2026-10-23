/** The request schemas the API validates with (and the web/mobile forms reuse). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  caseFiltersSchema,
  checklistUpdateSchema,
  createDonationSchema,
  createPayoutSchema,
  editCaseSchema,
  ledgerQuerySchema,
  otpVerifySchema,
  submitCaseSchema,
} from '../src/schemas';

const UUID = '00000000-0000-7000-8000-000000000001';
const story = 'قصة الحالة '.repeat(10);
const submission = {
  category: 'medical',
  submitterRelation: 'volunteer',
  title: { ar: 'عملية قلب لطفلة' },
  story: { ar: story },
  region: 'EG-C',
  goalMinor: 150_000_00,
  documents: [{ kind: 'medical_report', storageKey: `uploads/${UUID}/report.pdf`, sha256: 'a'.repeat(64) }],
  consent: true,
};

describe('request schemas', () => {
  it('accepts a submission written in either language and fills defaults', () => {
    const parsed = submitCaseSchema.parse(submission);
    assert.equal(parsed.currency, 'EGP');
    assert.equal(parsed.isUrgent, false);
    assert.deepEqual(parsed.beneficiary, {});
    const english = submitCaseSchema.safeParse({ ...submission, title: { en: 'Heart surgery for a girl' }, story: { en: 'A long story. '.repeat(8) } });
    assert.ok(english.success);
  });

  it('refuses submissions without consent, text or a valid national ID', () => {
    assert.ok(!submitCaseSchema.safeParse({ ...submission, consent: false }).success);
    assert.ok(!submitCaseSchema.safeParse({ ...submission, title: { ar: 'قصير' } }).success);
    assert.ok(!submitCaseSchema.safeParse({ ...submission, beneficiary: { nationalId: '12345' } }).success);
    assert.ok(submitCaseSchema.safeParse({ ...submission, beneficiary: { nationalId: '29001011234567', householdSize: 5 } }).success);
    assert.ok(!submitCaseSchema.safeParse({ ...submission, documents: [] }).success);
  });

  it('takes a partner association’s details with its submission, and requires them', () => {
    const association = { name: 'جمعية الخير لتنمية المجتمع', registrationNumber: '1234/2019', contactName: 'سعاد محمود', contactPhone: '+201001234567' };
    assert.ok(submitCaseSchema.safeParse({ ...submission, submitterRelation: 'association', association }).success);
    assert.ok(!submitCaseSchema.safeParse({ ...submission, submitterRelation: 'association' }).success, 'the association’s details are required');
    assert.ok(!submitCaseSchema.safeParse({ ...submission, submitterRelation: 'association', association: { ...association, contactPhone: '0100' } }).success);
  });

  it('applies donation defaults and rejects unknown methods', () => {
    const parsed = createDonationSchema.parse({ caseId: UUID, amountMinor: 100_00, currency: 'EGP', method: 'card' });
    assert.equal(parsed.type, 'sadaqah');
    assert.equal(parsed.locale, 'ar');
    assert.equal(parsed.coverFees, false);
    assert.ok(!createDonationSchema.safeParse({ caseId: UUID, amountMinor: 100_00, currency: 'EGP', method: 'bitcoin' }).success);
    assert.ok(!createDonationSchema.safeParse({ caseId: 'case_1', amountMinor: 100_00, currency: 'EGP', method: 'card' }).success);
  });

  it('reads catalog filters from a query string', () => {
    const parsed = caseFiltersSchema.parse({ categories: 'medical,debt_relief', urgentOnly: 'true', limit: '5', minProgress: '40' });
    assert.deepEqual(parsed.categories, ['medical', 'debt_relief']);
    assert.equal(parsed.urgentOnly, true);
    assert.equal(parsed.limit, 5);
    assert.equal(parsed.minProgress, 40);
    assert.equal(parsed.sort, 'urgent');
    assert.equal(ledgerQuerySchema.parse({}).limit, 200);
    assert.ok(!ledgerQuerySchema.safeParse({ limit: '5000' }).success);
  });

  it('validates staff actions', () => {
    assert.ok(createPayoutSchema.safeParse({ caseId: UUID, lineId: UUID }).success);
    assert.ok(!createPayoutSchema.safeParse({ caseId: UUID, lineId: UUID, amountMinor: -5 }).success);
    // A payout goes to the plan line's account; a typed account is not taken from the request.
    assert.deepEqual(createPayoutSchema.parse({ caseId: UUID, lineId: UUID, payeeAccount: 'EG380019000500000000263180002' }), { caseId: UUID, lineId: UUID });
    assert.ok(checklistUpdateSchema.safeParse({ item: 'residence', checked: true }).success);
    assert.ok(!checklistUpdateSchema.safeParse({ item: 'vibes', checked: true }).success);
    assert.ok(!editCaseSchema.safeParse({}).success);
    assert.ok(editCaseSchema.safeParse({ isUrgent: true, deadline: '2026-10-01T00:00:00Z' }).success);
    assert.ok(otpVerifySchema.safeParse({ phone: '+201001234567', code: '123456', totp: '654321' }).success);
    assert.ok(!otpVerifySchema.safeParse({ phone: '01001234567', code: '123456' }).success);
  });
});
