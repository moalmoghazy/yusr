/** «طريقة التواصل المفضلة»: the donation schema's contact rule, and how staff screens mask recipients. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canSeeSentMessages, maskRecipient, redactReceiptTokens } from '../src/contact';
import { createDonationSchema, quoteDonationSchema } from '../src/schemas';

const base = { caseId: '00000000-0000-7000-8000-000000000001', amountMinor: 100_00, currency: 'EGP', method: 'card' } as const;
const issuesOf = (input: unknown) => {
  const parsed = createDonationSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
};

describe('preferred contact channel', () => {
  it('requires the WhatsApp number when WhatsApp is chosen', () => {
    assert.deepEqual(issuesOf({ ...base, contactChannel: 'whatsapp', donor: { name: 'منى' } }), ['donor.phone']);
    assert.deepEqual(issuesOf({ ...base, contactChannel: 'whatsapp', donor: { email: 'mona@example.com' } }), ['donor.phone']);
    assert.deepEqual(issuesOf({ ...base, contactChannel: 'whatsapp', donor: { phone: '+201001234567' } }), []);
    assert.deepEqual(issuesOf({ ...base, contactChannel: 'whatsapp', donor: { phone: '01001234567' } }), ['donor.phone'], 'E.164 only');
  });

  it('requires the email address when email is chosen', () => {
    assert.deepEqual(issuesOf({ ...base, contactChannel: 'email' }), ['donor.email']);
    assert.deepEqual(issuesOf({ ...base, contactChannel: 'email', donor: { phone: '+201001234567' } }), ['donor.email']);
    assert.deepEqual(issuesOf({ ...base, contactChannel: 'email', donor: { email: 'mona@example.com' } }), []);
    assert.deepEqual(issuesOf({ ...base, contactChannel: 'email', donor: { email: 'not-an-email' } }), ['donor.email']);
  });

  it('refuses an unknown channel and keeps older requests (no channel) valid', () => {
    assert.ok(issuesOf({ ...base, contactChannel: 'sms', donor: { phone: '+201001234567' } }).length > 0);
    assert.deepEqual(issuesOf({ ...base, donor: { email: 'mona@example.com' } }), []);
    assert.ok(quoteDonationSchema.safeParse(base).success, 'the quote does not ask for a contact');
  });
});

describe('recipients on staff screens', () => {
  it('masks emails and phone numbers', () => {
    assert.equal(maskRecipient('mona@example.com'), 'mo•••@example.com');
    assert.equal(maskRecipient('+201001234567'), '+20••••••4567');
    assert.equal(maskRecipient(null), '—');
    assert.ok(!maskRecipient('+201001234567').includes('100123'));
  });

  it('hides receipt tokens in message text', () => {
    assert.equal(
      redactReceiptTokens('إيصالك: https://yusr.example/ar/receipt?donation=abc&token=0123456789abcdef'),
      'إيصالك: https://yusr.example/ar/receipt?donation=abc&token=•••',
    );
  });

  it('opens the demo outbox to super admins and content moderators only', () => {
    assert.ok(canSeeSentMessages(['super_admin']));
    assert.ok(canSeeSentMessages(['donor', 'content_moderator']));
    assert.ok(!canSeeSentMessages(['financial_officer']));
    assert.ok(!canSeeSentMessages(['field_auditor', 'donor']));
  });
});
