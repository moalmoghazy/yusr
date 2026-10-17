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
    // Enroll: a staff member without a secret yet signs in without MFA, then turns it on.
    await db.transaction((tx) => tx.users.update(staff.id, { mfaEnabled: false }));
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
