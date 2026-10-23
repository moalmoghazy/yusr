import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthSession } from '@yusr/core';
import { clearedDonorCookies, DONOR_ACCESS_COOKIE, DONOR_REFRESH_COOKIE, donorSessionCookies, isFresh, readDonorClaims } from '../src/lib/donor-session';

const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

describe('donor session cookies', () => {
  it('reads the name and expiry from the access token, Arabic names included', () => {
    assert.deepEqual(readDonorClaims(token({ sub: 'u1', name: 'منى سعيد', exp: 2_000_000_000, roles: [] })), {
      sub: 'u1',
      name: 'منى سعيد',
      exp: 2_000_000_000,
    });
  });

  it('treats anything malformed as signed out', () => {
    for (const value of [undefined, '', 'abc', 'a.b.c', token({ name: 'x', exp: 1 }), token({ sub: 'u1' })]) assert.equal(readDonorClaims(value), null);
  });

  it('counts a token as fresh only with more than a minute left', () => {
    const now = 1_000_000_000_000;
    assert.equal(isFresh({ sub: 'u', name: '', exp: now / 1000 + 120 }, now), true);
    assert.equal(isFresh({ sub: 'u', name: '', exp: now / 1000 + 30 }, now), false);
    assert.equal(isFresh(null, now), false);
  });

  it('keeps both tokens out of browser JavaScript and clears them together', () => {
    const session = { accessToken: 'at', refreshToken: 'rt', expiresIn: 900, user: {} } as AuthSession;
    const writes = donorSessionCookies(session);
    assert.deepEqual(
      writes.map((write) => [write.name, write.value, write.options.maxAge]),
      [
        [DONOR_ACCESS_COOKIE, 'at', 900],
        [DONOR_REFRESH_COOKIE, 'rt', 30 * 86_400],
      ],
    );
    assert.ok(writes.every((write) => write.options.httpOnly && write.options.sameSite === 'lax'));
    assert.deepEqual(
      clearedDonorCookies().map((write) => [write.name, write.value, write.options.maxAge]),
      [
        [DONOR_ACCESS_COOKIE, '', 0],
        [DONOR_REFRESH_COOKIE, '', 0],
      ],
    );
  });
});
