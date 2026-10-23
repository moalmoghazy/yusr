import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import { DomainError, type Locale } from '@yusr/core';
import { AuthService, type AuthConfig } from '../src/auth/auth.service';
import { signAccessToken, verifyAccessToken } from '../src/auth/jwt';
import { OAuthVerifier } from '../src/auth/oauth';
import { DEFAULT_OTP, OtpService, type OtpSender } from '../src/auth/otp.service';
import { base32Encode, totpAt, verifyTotp } from '../src/auth/totp';
import { FieldCipher } from '../src/common/cipher';
import { ManualClock } from '../src/common/clock';
import { sequentialIds } from '../src/common/ids';
import { MemoryKv } from '../src/common/kv';
import { RateLimiter } from '../src/common/rate-limit';
import { TeamService } from '../src/admin/admin.queries';
import { MemoryDatabase } from '../src/db/memory';
import type { FetchLike } from '../src/payments/gateway';
import { USERS } from './support/fixtures';

const CONFIG: AuthConfig = {
  jwtSecrets: { k1: 'old-secret-used-before-rotation', k2: 'current-signing-secret' },
  activeKeyId: 'k2',
  issuer: 'https://api.yusr.example',
  audience: 'yusr-api',
  accessTtlSeconds: 900,
  refreshTtlDays: 30,
};

const GOOGLE_CLIENT = 'web-client.apps.googleusercontent.com';

class CapturingSender implements OtpSender {
  readonly sent: Array<{ phone: string; code: string; locale: Locale }> = [];
  async sendOtp(phone: string, code: string, locale: Locale) {
    this.sent.push({ phone, code, locale });
  }
  last() {
    return this.sent[this.sent.length - 1]!.code;
  }
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'google-key-1', alg: 'RS256', use: 'sig' };

function idToken(payload: Record<string, unknown>, kid = 'google-key-1'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url');
  return `${header}.${body}.${signature}`;
}

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => DomainError.is(error) && error.code === code);
}

async function setupAuth() {
  const clock = new ManualClock('2026-09-26T09:00:00Z');
  const ids = sequentialIds('00000000-0000-7000-9000-');
  const db = new MemoryDatabase(() => clock.now());
  await db.seed(async (tx) => {
    for (const user of Object.values(USERS)) await tx.users.insert(user);
  });
  const kv = new MemoryKv(clock);
  const sender = new CapturingSender();
  const otp = new OtpService(kv, new RateLimiter(kv), sender, clock, { ...DEFAULT_OTP, pepper: 'otp-pepper' });
  let jwksCalls = 0;
  const fetchJwks: FetchLike = async () => {
    jwksCalls += 1;
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  };
  const oauth = new OAuthVerifier({ clientIds: { google: [GOOGLE_CLIENT], apple: ['example.yusr.app'] } }, clock, fetchJwks);
  const cipher = new FieldCipher(FieldCipher.randomKey());
  const auth = new AuthService({ db, otp, oauth, cipher, clock, ids, config: CONFIG });
  return { clock, db, kv, sender, auth, cipher, jwksCalls: () => jwksCalls };
}

describe('phone sign-in (OTP)', () => {
  it('reveals the code in the response only in a public demo', async () => {
    const clock = new ManualClock('2026-09-26T09:00:00Z');
    const kv = new MemoryKv(clock);
    const sender = new CapturingSender();
    const real = await new OtpService(kv, new RateLimiter(kv), sender, clock, { ...DEFAULT_OTP, pepper: 'p' }).request('+201099990001', {
      ip: null,
      locale: 'ar',
    });
    assert.equal('demoCode' in real, false, 'never on a real deployment');
    const demo = await new OtpService(kv, new RateLimiter(kv), sender, clock, { ...DEFAULT_OTP, pepper: 'p', revealCode: true }).request('+201099990002', {
      ip: null,
      locale: 'ar',
    });
    assert.equal(demo.demoCode, sender.last());
  });

  it('sends a code, accepts it once and creates a donor account', async () => {
    const { auth, sender } = await setupAuth();
    await auth.requestOtp('+201099990000', { ip: '41.33.1.1', locale: 'ar' });
    const code = sender.last();
    assert.match(code, /^\d{6}$/);
    const session = await auth.verifyOtp({ phone: '+201099990000', code, name: 'سارة' });
    assert.deepEqual(session.user.roles, ['donor']);
    assert.equal(session.user.name, 'سارة');
    assert.equal(auth.authenticate(session.accessToken).id, session.user.id);
    await rejects(auth.verifyOtp({ phone: '+201099990000', code }), 'OTP_EXPIRED');
  });

  it('counts wrong codes, locks after five and enforces the resend cooldown', async () => {
    const { auth, sender, clock } = await setupAuth();
    await auth.requestOtp('+201099990001', { ip: null, locale: 'en' });
    await rejects(auth.requestOtp('+201099990001', { ip: null, locale: 'en' }), 'RATE_LIMITED');
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(auth.verifyOtp({ phone: '+201099990001', code: '000000' === sender.last() ? '111111' : '000000' }), (error: unknown) => {
        return DomainError.is(error, 'OTP_INVALID') && (error.details?.['attemptsLeft'] as number) === 4 - i;
      });
    }
    await rejects(auth.verifyOtp({ phone: '+201099990001', code: sender.last() }), 'RATE_LIMITED');
    clock.advance(61_000);
    await auth.requestOtp('+201099990001', { ip: null, locale: 'en' });
    clock.advance(301_000);
    await rejects(auth.verifyOtp({ phone: '+201099990001', code: sender.last() }), 'OTP_EXPIRED');
  });

  it('sends codes only to the countries Yusr serves, within a platform-wide hourly budget', async () => {
    const clock = new ManualClock('2026-09-26T09:00:00Z');
    const kv = new MemoryKv(clock);
    const sender = new CapturingSender();
    const otp = new OtpService(kv, new RateLimiter(kv), sender, clock, { ...DEFAULT_OTP, pepper: 'p', hourlyBudget: 3 });
    for (const phone of ['+447700900123', '+12025550123', '+2341234567890', '+9715012345678']) {
      await rejects(otp.request(phone, { ip: null, locale: 'en' }), 'VALIDATION_FAILED');
    }
    assert.equal(sender.sent.length, 0, 'nothing sent abroad');
    await otp.request('+201000000101', { ip: '41.33.1.1', locale: 'ar' });
    await otp.request('+966501234567', { ip: '41.33.1.2', locale: 'ar' });
    await otp.request('+201000000102', { ip: '41.33.1.3', locale: 'ar' });
    await rejects(otp.request('+201000000103', { ip: '41.33.1.4', locale: 'ar' }), 'RATE_LIMITED');
    assert.equal(sender.sent.length, 3);
    clock.advance(3_601_000);
    await otp.request('+201000000103', { ip: '41.33.1.4', locale: 'ar' });
  });

  it('does not count requests refused during the cooldown', async () => {
    const { auth, clock } = await setupAuth();
    await auth.requestOtp('+201099990003', { ip: '41.33.1.1', locale: 'ar' });
    for (let i = 0; i < 10; i += 1) await rejects(auth.requestOtp('+201099990003', { ip: '41.33.1.1', locale: 'ar' }), 'RATE_LIMITED');
    for (let i = 0; i < 4; i += 1) {
      clock.advance(61_000);
      await auth.requestOtp('+201099990003', { ip: '41.33.1.1', locale: 'ar' });
    }
  });

  it('keeps a stranger from locking someone else out of sign-in', async () => {
    const { auth, sender, clock } = await setupAuth();
    const phone = '+201099990004';
    // Asking for codes from one address uses up that address's share only.
    for (let i = 0; i < 5; i += 1) {
      await auth.requestOtp(phone, { ip: '203.0.113.9', locale: 'ar' });
      clock.advance(61_000);
    }
    await rejects(auth.requestOtp(phone, { ip: '203.0.113.9', locale: 'ar' }), 'RATE_LIMITED');
    clock.advance(61_000);
    await auth.requestOtp(phone, { ip: '41.33.1.1', locale: 'ar' });
    const code = sender.last();
    const wrong = code === '000000' ? '111111' : '000000';
    // Guesses from the stranger's address are limited by phone + IP (the code itself allows 5 tries, then
    // is discarded; the owner asks for a new one)…
    for (let i = 0; i < 10; i += 1) await assert.rejects(auth.verifyOtp({ phone, code: wrong, ip: '203.0.113.9' }));
    await rejects(auth.verifyOtp({ phone, code: wrong, ip: '203.0.113.9' }), 'RATE_LIMITED');
    // …so the owner can still ask for a fresh code and sign in from their own.
    clock.advance(61_000);
    await auth.requestOtp(phone, { ip: '41.33.1.1', locale: 'ar' });
    const session = await auth.verifyOtp({ phone, code: sender.last(), ip: '41.33.1.1' });
    assert.ok(session.accessToken);
  });

  it('limits codes per phone per hour', async () => {
    const { auth, clock } = await setupAuth();
    for (let i = 0; i < 5; i += 1) {
      await auth.requestOtp('+201099990002', { ip: null, locale: 'ar' });
      clock.advance(61_000);
    }
    await rejects(auth.requestOtp('+201099990002', { ip: null, locale: 'ar' }), 'RATE_LIMITED');
  });
});

describe('sessions', () => {
  it('rotates refresh tokens and revokes the whole login when a rotated token is replayed', async () => {
    const { auth, sender, db } = await setupAuth();
    await auth.requestOtp(USERS.donor.phone!, { ip: null, locale: 'ar' });
    const first = await auth.verifyOtp({ phone: USERS.donor.phone!, code: sender.last() });
    assert.equal(first.user.id, USERS.donor.id);
    const second = await auth.refresh(first.refreshToken, 'test-agent');
    assert.notEqual(second.refreshToken, first.refreshToken);
    await rejects(auth.refresh(first.refreshToken, 'attacker'), 'SESSION_REVOKED');
    await rejects(auth.refresh(second.refreshToken, 'test-agent'), 'SESSION_REVOKED');
    assert.ok(db.auditRows().some((row) => row.action === 'auth.refresh_reuse_detected'));
  });

  it('rejects tampered, expired and foreign access tokens, and keeps rotated keys valid', async () => {
    const { auth, sender, clock } = await setupAuth();
    await auth.requestOtp(USERS.donor.phone!, { ip: null, locale: 'ar' });
    const session = await auth.verifyOtp({ phone: USERS.donor.phone!, code: sender.last() });
    const [header, payload, signature] = session.accessToken.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), roles: ['super_admin'] })).toString('base64url');
    assert.throws(
      () => auth.authenticate(`${header}.${forged}.${signature}`),
      (error: unknown) => DomainError.is(error, 'UNAUTHENTICATED'),
    );

    const now = Math.floor(clock.now().getTime() / 1000);
    const claims = { sub: 'u1', name: 'x', roles: [], mfa: false, iss: CONFIG.issuer, aud: CONFIG.audience, iat: now, exp: now + 60 };
    const oldKeyToken = signAccessToken({ ...claims, roles: ['donor'] }, CONFIG.jwtSecrets['k1']!, 'k1');
    assert.equal(verifyAccessToken(oldKeyToken, CONFIG.jwtSecrets, { issuer: CONFIG.issuer, audience: CONFIG.audience, now: clock.now() }).sub, 'u1');
    assert.throws(() =>
      verifyAccessToken(signAccessToken({ ...claims, roles: ['donor'], aud: 'other' }, 'current-signing-secret', 'k2'), CONFIG.jwtSecrets, {
        issuer: CONFIG.issuer,
        audience: CONFIG.audience,
        now: clock.now(),
      }),
    );
    clock.advance(901_000);
    assert.throws(
      () => auth.authenticate(session.accessToken),
      (error: unknown) => DomainError.is(error, 'UNAUTHENTICATED'),
    );
  });

  it('requires an authenticator code for staff and keeps that level across refreshes', async () => {
    const { auth, sender, db, clock, cipher } = await setupAuth();
    const staff = USERS.financeA;
    // Enroll: a staff member without a secret yet signs in without MFA, then turns it on inside the
    // enrollment a super admin opened for them.
    await db.transaction((tx) => tx.users.update(staff.id, { mfaEnabled: false, mfaEnrollmentExpiresAt: new Date(clock.now().getTime() + 3_600_000) }));
    await auth.requestOtp(staff.phone!, { ip: null, locale: 'ar' });
    const enrollSession = await auth.verifyOtp({ phone: staff.phone!, code: sender.last() });
    assert.equal(enrollSession.user.mfa, false);
    const actor = auth.authenticate(enrollSession.accessToken);
    const { secret, otpauthUri } = await auth.enrollMfa(actor);
    assert.match(otpauthUri, /^otpauth:\/\/totp\/Yusr%3A.+secret=[A-Z2-7]+&issuer=Yusr/);
    await rejects(auth.confirmMfa(actor, '000000'), 'OTP_INVALID');
    await auth.confirmMfa(actor, totpAt(secret, clock.now()));
    assert.ok((await db.read.users.byId(staff.id))?.totpSecretCipher, 'secret stored encrypted');
    assert.equal(cipher.decrypt((await db.read.users.byId(staff.id))!.totpSecretCipher!, `totp:${staff.id}`), secret);

    clock.advance(61_000);
    await auth.requestOtp(staff.phone!, { ip: null, locale: 'ar' });
    const code = sender.last();
    await assert.rejects(
      auth.verifyOtp({ phone: staff.phone!, code }),
      (error: unknown) => DomainError.is(error, 'UNAUTHENTICATED') && error.details?.['mfaRequired'] === true,
    );

    clock.advance(61_000);
    await auth.requestOtp(staff.phone!, { ip: null, locale: 'ar' });
    const session = await auth.verifyOtp({ phone: staff.phone!, code: sender.last(), totp: totpAt(secret, clock.now()) });
    assert.equal(session.user.mfa, true);
    assert.equal(auth.authenticate(session.accessToken).mfa, true);
    const refreshed = await auth.refresh(session.refreshToken, null);
    assert.equal(refreshed.user.mfa, true);
    assert.equal((await db.read.users.byId(staff.id))?.mfaEnrollmentExpiresAt, null, 'the enrollment is used up');
  });

  it('does not let a staff account attach an authenticator without an enrollment a super admin opened', async () => {
    const { auth, sender, db, clock } = await setupAuth();
    const staff = USERS.financeA;
    await db.transaction((tx) => tx.users.update(staff.id, { mfaEnabled: false, totpSecretCipher: null }));
    await auth.requestOtp(staff.phone!, { ip: null, locale: 'ar' });
    const actor = auth.authenticate((await auth.verifyOtp({ phone: staff.phone!, code: sender.last() })).accessToken);
    await rejects(auth.enrollMfa(actor), 'FORBIDDEN');

    // A window that has passed is no better than none.
    await db.transaction((tx) => tx.users.update(staff.id, { mfaEnrollmentExpiresAt: new Date(clock.now().getTime() - 1) }));
    await rejects(auth.enrollMfa(actor), 'FORBIDDEN');

    // Donors have no staff permissions to protect: there is nothing for them to enroll.
    await auth.requestOtp(USERS.donor.phone!, { ip: null, locale: 'ar' });
    const donor = auth.authenticate((await auth.verifyOtp({ phone: USERS.donor.phone!, code: sender.last() })).accessToken);
    await db.transaction((tx) => tx.users.update(USERS.donor.id, { mfaEnrollmentExpiresAt: new Date(clock.now().getTime() + 60_000) }));
    await rejects(auth.enrollMfa(donor), 'FORBIDDEN');
  });

  it('accepts an authenticator code once', async () => {
    const { auth, sender, db, clock, cipher, kv } = await setupAuth();
    const staff = USERS.financeA;
    const secret = base32Encode(Buffer.alloc(20, 9));
    await db.transaction((tx) => tx.users.update(staff.id, { mfaEnabled: true, totpSecretCipher: cipher.encrypt(secret, `totp:${staff.id}`) }));
    const totp = totpAt(secret, clock.now());
    await auth.requestOtp(staff.phone!, { ip: null, locale: 'ar' });
    const session = await auth.verifyOtp({ phone: staff.phone!, code: sender.last(), totp });
    assert.equal(session.user.mfa, true);

    // The same code again, a few seconds later and still inside the drift window: refused.
    clock.advance(5_000);
    await kv.del(`otp:cooldown:${staff.phone!}`);
    await auth.requestOtp(staff.phone!, { ip: null, locale: 'ar' });
    await assert.rejects(
      auth.verifyOtp({ phone: staff.phone!, code: sender.last(), totp }),
      (error: unknown) => DomainError.is(error, 'OTP_INVALID') && error.details?.['mfaRequired'] === true,
    );
    clock.advance(30_000);
    await kv.del(`otp:cooldown:${staff.phone!}`);
    await auth.requestOtp(staff.phone!, { ip: null, locale: 'ar' });
    const next = await auth.verifyOtp({ phone: staff.phone!, code: sender.last(), totp: totpAt(secret, clock.now()) });
    assert.equal(next.user.mfa, true, 'a fresh code works');
  });

  it('ends every session of a person with revokeAllForUser', async () => {
    const { auth, sender, db, clock } = await setupAuth();
    const sessions = [];
    for (let i = 0; i < 2; i += 1) {
      await auth.requestOtp(USERS.donor.phone!, { ip: null, locale: 'ar' });
      sessions.push(await auth.verifyOtp({ phone: USERS.donor.phone!, code: sender.last() }));
      clock.advance(61_000);
    }
    assert.equal(await db.transaction((tx) => tx.refreshTokens.revokeAllForUser(USERS.donor.id, clock.now())), 2);
    for (const session of sessions) await rejects(auth.refresh(session.refreshToken, null), 'SESSION_REVOKED');
  });
});

describe('role changes', () => {
  const admin = { id: '00000000-0000-4000-8000-0000000000ad', name: 'Admin', roles: ['super_admin' as const], mfa: true };

  it('signs the person out everywhere and opens a one-day authenticator enrollment for new staff', async () => {
    const { auth, sender, db, clock } = await setupAuth();
    await auth.requestOtp(USERS.donor.phone!, { ip: null, locale: 'ar' });
    const session = await auth.verifyOtp({ phone: USERS.donor.phone!, code: sender.last() });
    const team = new TeamService(db, clock);

    const member = await team.updateRoles(USERS.donor.id, ['donor', 'field_auditor'], { actor: admin });
    assert.equal(member.mfa, false);
    await rejects(auth.refresh(session.refreshToken, null), 'SESSION_REVOKED');
    const promoted = await db.read.users.byId(USERS.donor.id);
    assert.equal(promoted?.mfaEnrollmentExpiresAt?.getTime(), clock.now().getTime() + 24 * 3_600_000);
    const audit = db.auditRows().find((row) => row.action === 'user.roles_updated');
    assert.equal(audit?.after?.['sessionsRevoked'], 1);

    // Inside the window the new staff member enrolls their own authenticator.
    clock.advance(61_000);
    await auth.requestOtp(USERS.donor.phone!, { ip: null, locale: 'ar' });
    const actor = auth.authenticate((await auth.verifyOtp({ phone: USERS.donor.phone!, code: sender.last() })).accessToken);
    const { secret } = await auth.enrollMfa(actor);
    await auth.confirmMfa(actor, totpAt(secret, clock.now()));
    assert.equal((await db.read.users.byId(USERS.donor.id))?.mfaEnabled, true);

    // Taking a staff role away ends sessions too.
    clock.advance(61_000);
    await auth.requestOtp(USERS.donor.phone!, { ip: null, locale: 'ar' });
    const staffSession = await auth.verifyOtp({ phone: USERS.donor.phone!, code: sender.last(), totp: totpAt(secret, clock.now()) });
    await team.updateRoles(USERS.donor.id, ['donor'], { actor: admin });
    await rejects(auth.refresh(staffSession.refreshToken, null), 'SESSION_REVOKED');
  });
});

describe('access token keys', () => {
  it('refuses key ids that are not own keys (no prototype lookups)', () => {
    const now = Math.floor(Date.parse('2026-09-26T09:00:00Z') / 1000);
    const claims = { sub: 'u1', name: 'x', roles: [], mfa: false, iss: CONFIG.issuer, aud: CONFIG.audience, iat: now, exp: now + 60 };
    for (const kid of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const token = signAccessToken(claims, 'whatever', kid);
      assert.throws(
        () => verifyAccessToken(token, CONFIG.jwtSecrets, { issuer: CONFIG.issuer, audience: CONFIG.audience, now: new Date(now * 1000) }),
        (error: unknown) => DomainError.is(error, 'UNAUTHENTICATED'),
        kid,
      );
    }
  });
});

describe('Google and Apple sign-in', () => {
  const base = {
    iss: 'https://accounts.google.com',
    aud: GOOGLE_CLIENT,
    sub: '1098765432101',
    email: 'noor@example.com',
    email_verified: true,
    name: 'Noor Ali',
  };

  it('verifies the ID token against the published keys and links by verified email', async () => {
    const { auth, clock, jwksCalls } = await setupAuth();
    const exp = Math.floor(clock.now().getTime() / 1000) + 600;
    const session = await auth.signInWithProvider('google', { idToken: idToken({ ...base, exp }) });
    assert.equal(session.user.name, 'Noor Ali');
    const again = await auth.signInWithProvider('google', { idToken: idToken({ ...base, exp }) });
    assert.equal(again.user.id, session.user.id);
    assert.equal(jwksCalls(), 1, 'keys are cached');

    const linked = await auth.signInWithProvider('google', { idToken: idToken({ ...base, sub: 'other-sub', email: USERS.donor.email, exp }) });
    assert.equal(linked.user.id, USERS.donor.id);
  });

  it('rejects wrong audience, expiry, tampering and unknown keys', async () => {
    const { auth, clock } = await setupAuth();
    const exp = Math.floor(clock.now().getTime() / 1000) + 600;
    await rejects(auth.signInWithProvider('google', { idToken: idToken({ ...base, aud: 'someone-else', exp }) }), 'UNAUTHENTICATED');
    await rejects(auth.signInWithProvider('google', { idToken: idToken({ ...base, exp: exp - 1_200 }) }), 'UNAUTHENTICATED');
    await rejects(auth.signInWithProvider('google', { idToken: idToken({ ...base, iss: 'https://evil.example', exp }) }), 'UNAUTHENTICATED');
    const [header, , signature] = idToken({ ...base, exp }).split('.');
    const tampered = Buffer.from(JSON.stringify({ ...base, exp, email: 'admin@yusr.example' })).toString('base64url');
    await rejects(auth.signInWithProvider('google', { idToken: `${header}.${tampered}.${signature}` }), 'UNAUTHENTICATED');
    await rejects(auth.signInWithProvider('google', { idToken: idToken({ ...base, exp }, 'rotated-away') }), 'UNAUTHENTICATED');
  });
});

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    assert.equal(totpAt(secret, new Date(59_000), 30, 8), '94287082');
    assert.equal(totpAt(secret, new Date(1_111_111_109_000), 30, 8), '07081804');
    assert.equal(totpAt(secret, new Date(1_234_567_890_000), 30, 8), '89005924');
    const now = new Date('2026-09-26T09:00:00Z');
    assert.ok(verifyTotp(secret, totpAt(secret, new Date(now.getTime() - 30_000)), now));
    assert.ok(!verifyTotp(secret, totpAt(secret, new Date(now.getTime() - 120_000)), now));
  });
});
