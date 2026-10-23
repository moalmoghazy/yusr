import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { generateYusrCode, hasPermission, isYusrCode, normalizeRegistrationNumber, normalizeYusrCode, YUSR_CODE_ALPHABET } from '../src';
import { createPartnerSchema, partnerCredentialsSchema } from '../src/schemas';

describe('«كود يُسر»', () => {
  it('generates codes in the canonical shape from an unambiguous alphabet', () => {
    const codes = new Set<string>();
    for (let index = 0; index < 2_000; index += 1) {
      const code = generateYusrCode((count) => randomBytes(count));
      assert.ok(isYusrCode(code), code);
      assert.ok(!/[01OIL]/.test(code.slice(4)), `no look-alike characters in ${code}`);
      codes.add(code);
    }
    assert.equal(codes.size, 2_000, 'no repeats in a large sample');
    assert.ok(!/[01OIL]/.test(YUSR_CODE_ALPHABET));
  });

  it('keeps sampling past bytes that would bias the alphabet', () => {
    let calls = 0;
    const code = generateYusrCode((count) => {
      calls += 1;
      return new Uint8Array(count).fill(calls === 1 ? 255 : 0);
    });
    assert.equal(code, `YSR-${YUSR_CODE_ALPHABET[0]!.repeat(8)}`);
    assert.equal(calls, 2);
  });

  it('normalizes what people type', () => {
    assert.equal(normalizeYusrCode(' ysr-7k2m 9qxa '), 'YSR-7K2M9QXA');
    assert.equal(normalizeYusrCode('7K2M9QXA'), 'YSR-7K2M9QXA');
    assert.equal(normalizeYusrCode('YSR-٧K٢M٩QXA'), 'YSR-7K2M9QXA');
    assert.equal(normalizeRegistrationNumber(' ١٢٣٤ / ٢٠١٩ '), '1234/2019');
    assert.equal(partnerCredentialsSchema.safeParse({ registrationNumber: '1234/2019', yusrCode: 'YSR-OOOOOOOO' }).success, false);
  });

  it('validates a new partner, including the contract date', () => {
    const partner = {
      name: 'جمعية الخير',
      registrationNumber: '1234/2019',
      region: 'EG-C',
      contractSignedOn: '2026-10-01',
      contactName: 'سعاد',
      contactPhone: '+201001234567',
    };
    assert.ok(createPartnerSchema.safeParse(partner).success);
    assert.ok(!createPartnerSchema.safeParse({ ...partner, contractSignedOn: '01/10/2026' }).success);
    assert.ok(!createPartnerSchema.safeParse({ ...partner, region: 'Cairo' }).success);
  });

  it('lets only content moderators and super admins manage partners', () => {
    assert.ok(hasPermission(['content_moderator'], 'partners:manage'));
    assert.ok(hasPermission(['super_admin'], 'partners:manage'));
    for (const role of ['donor', 'beneficiary', 'volunteer', 'field_auditor', 'financial_officer'] as const) {
      assert.ok(!hasPermission([role], 'partners:manage'), role);
    }
  });
});
