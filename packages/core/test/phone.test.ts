import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { phoneSchema } from '../src/schemas';
import { toE164 } from '../src/phone';

describe('toE164', () => {
  it('accepts local Egyptian and Saudi mobiles, Arabic digits and spacing', () => {
    assert.equal(toE164('01001234567'), '+201001234567');
    assert.equal(toE164('٠١٠٠ ١٢٣ ٤٥٦٧'), '+201001234567');
    assert.equal(toE164('010-0123-4567'), '+201001234567');
    assert.equal(toE164('0501234567', 'SA'), '+966501234567');
    assert.equal(toE164('00966501234567', 'SA'), '+966501234567');
    assert.equal(toE164('+201001234567', null), '+201001234567');
  });

  it('leaves what it cannot place for the schema to reject, and empty stays empty', () => {
    assert.equal(toE164(''), null);
    assert.equal(toE164('   '), null);
    assert.equal(toE164(undefined), null);
    const unknown = toE164('12345', null)!;
    assert.equal(phoneSchema.safeParse(unknown).success, false);
    assert.equal(phoneSchema.safeParse(toE164('01001234567')).success, true);
  });
});
