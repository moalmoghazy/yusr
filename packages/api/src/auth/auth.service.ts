/**
 * Sessions: phone OTP or Google/Apple sign-in → a 15-minute access token (JWT) and an
 * opaque refresh token that rotates on every use. Presenting a refresh token that was
 * already rotated means it leaked: the whole login ("family") is revoked.
 * Staff accounts add an authenticator-app code (TOTP); without it their session
 * carries mfa=false and every staff permission check refuses it.
 */
import { DomainError, isStaff, type AuthSession, type Locale } from '@yusr/core';
import type { RequestActor } from '../common/actor';
import type { FieldCipher } from '../common/cipher';
import type { Clock } from '../common/clock';
import { randomToken, sha256Hex } from '../common/crypto';
import type { IdGenerator } from '../common/ids';
import type { Database } from '../db/ports';
import type { UserRow } from '../db/rows';
import { signAccessToken, verifyAccessToken, type AccessClaims } from './jwt';
import type { OAuthProvider, OAuthVerifier } from './oauth';
import type { OtpService } from './otp.service';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp';

export interface AuthConfig {
  jwtSecrets: Readonly<Record<string, string>>;
  activeKeyId: string;
  issuer: string;
  audience: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
}

/** The session contract lives in @yusr/core so the SDK and apps share it. */
export type Session = AuthSession;

export interface AuthDeps {
  db: Database;
  otp: OtpService;
  oauth: OAuthVerifier;
  cipher: FieldCipher;
  clock: Clock;
  ids: IdGenerator;
  config: AuthConfig;
}

export class AuthService {
  constructor(private readonly deps: AuthDeps) {}

  requestOtp(phone: string, context: { ip: string | null; locale: Locale }) {
    return this.deps.otp.request(phone, context);
  }

  async verifyOtp(input: {
    phone: string;
    code: string;
    totp?: string | null;
    name?: string | null;
    locale?: Locale;
    userAgent?: string | null;
  }): Promise<Session> {
    await this.deps.otp.verify(input.phone, input.code);
    const { db, clock, ids } = this.deps;
    const user = await db.transaction(async (tx) => {
      const existing = await tx.users.byPhone(input.phone);
      if (existing) return existing;
      const now = clock.now();
      const created: UserRow = {
        id: ids(),
        phone: input.phone,
        email: null,
        displayName: input.name?.trim() || (input.locale === 'en' ? 'Donor' : 'متبرع'),
        locale: input.locale ?? 'ar',
        roles: ['donor'],
        region: null,
        mfaEnabled: false,
        totpSecretCipher: null,
        marketingOptIn: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await tx.users.insert(created);
      await tx.users.insertIdentity({ id: ids(), userId: created.id, provider: 'phone', subject: input.phone, createdAt: now });
      return created;
    });
    return this.startSession(user, input.totp ?? null, input.userAgent ?? null);
  }

  async signInWithProvider(
    provider: OAuthProvider,
    input: { idToken: string; nonce?: string; totp?: string | null; locale?: Locale; userAgent?: string | null },
  ): Promise<Session> {
    const identity = await this.deps.oauth.verify(provider, input.idToken, input.nonce);
    const { db, clock, ids } = this.deps;
    const user = await db.transaction(async (tx) => {
      const linked = await tx.users.identity(provider, identity.subject);
      if (linked) {
        const row = await tx.users.byId(linked.userId);
        if (row) return row;
      }
      // Link to an existing account only through a verified email.
      const byEmail = identity.email && identity.emailVerified ? await tx.users.byEmail(identity.email) : null;
      const now = clock.now();
      const row: UserRow =
        byEmail ??
        ({
          id: ids(),
          phone: null,
          email: identity.email,
          displayName: identity.name ?? (input.locale === 'en' ? 'Donor' : 'متبرع'),
          locale: input.locale ?? 'ar',
          roles: ['donor'],
          region: null,
          mfaEnabled: false,
          totpSecretCipher: null,
          marketingOptIn: false,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        } satisfies UserRow);
      if (!byEmail) {
        if (!row.email) throw new DomainError('VALIDATION_FAILED', 'The provider did not share an email address');
        await tx.users.insert(row);
      }
      await tx.users.insertIdentity({ id: ids(), userId: row.id, provider, subject: identity.subject, createdAt: now });
      return row;
    });
    return this.startSession(user, input.totp ?? null, input.userAgent ?? null);
  }

  private async startSession(user: UserRow, totp: string | null, userAgent: string | null): Promise<Session> {
    if (user.status !== 'active') throw new DomainError('FORBIDDEN', 'This account is not active');
    let mfa = false;
    if (isStaff(user.roles) && user.mfaEnabled) {
      if (!totp) throw new DomainError('UNAUTHENTICATED', 'Authenticator code required', { mfaRequired: true });
      if (!this.checkTotp(user, totp)) throw new DomainError('OTP_INVALID', 'Authenticator code is not correct', { mfaRequired: true });
      mfa = true;
    }
    const refreshToken = await this.storeRefreshToken(user.id, this.deps.ids(), userAgent, mfa);
    return this.session(user, mfa, refreshToken);
  }

  private checkTotp(user: UserRow, code: string): boolean {
    if (!user.totpSecretCipher) return false;
    const secret = this.deps.cipher.decrypt(user.totpSecretCipher, `totp:${user.id}`);
    return verifyTotp(secret, code, this.deps.clock.now());
  }

  private async storeRefreshToken(userId: string, familyId: string, userAgent: string | null, mfa: boolean): Promise<string> {
    const { db, clock, ids, config } = this.deps;
    const token = randomToken(32);
    const now = clock.now();
    await db.transaction((tx) =>
      tx.refreshTokens.insert({
        id: ids(),
        userId,
        familyId,
        tokenHash: sha256Hex(token),
        mfa,
        replacedBy: null,
        revokedAt: null,
        expiresAt: new Date(now.getTime() + config.refreshTtlDays * 86_400_000),
        userAgent: userAgent?.slice(0, 200) ?? null,
        createdAt: now,
      }),
    );
    return token;
  }

  private session(user: UserRow, mfa: boolean, refreshToken: string): Session {
    const { config, clock } = this.deps;
    const iat = Math.floor(clock.now().getTime() / 1000);
    const claims: AccessClaims = {
      sub: user.id,
      name: user.displayName,
      roles: user.roles,
      mfa,
      iss: config.issuer,
      aud: config.audience,
      iat,
      exp: iat + config.accessTtlSeconds,
    };
    const secret = config.jwtSecrets[config.activeKeyId];
    if (!secret) throw new Error(`Missing JWT secret for key ${config.activeKeyId}`);
    return {
      accessToken: signAccessToken(claims, secret, config.activeKeyId),
      refreshToken,
      expiresIn: config.accessTtlSeconds,
      user: { id: user.id, name: user.displayName, roles: user.roles, locale: user.locale, mfa, mfaEnrolled: user.mfaEnabled },
    };
  }

  /** Rotates the refresh token. Reuse of a rotated token revokes every token of that login. */
  async refresh(presented: string, userAgent: string | null): Promise<Session> {
    const { db, clock, ids } = this.deps;
    const token = presented;
    const now = clock.now();
    const outcome = await db.transaction(async (tx) => {
      const row = await tx.refreshTokens.byHash(sha256Hex(token), 'update');
      if (!row) return { error: new DomainError('UNAUTHENTICATED', 'Unknown refresh token') };
      if (row.revokedAt) {
        if (row.replacedBy) {
          await tx.refreshTokens.revokeFamily(row.familyId, now);
          await tx.audit.record({
            actorId: row.userId,
            actorRole: null,
            action: 'auth.refresh_reuse_detected',
            entityType: 'user',
            entityId: row.userId,
            after: { familyId: row.familyId },
          });
        }
        return { error: new DomainError('SESSION_REVOKED') };
      }
      if (row.expiresAt <= now) return { error: new DomainError('UNAUTHENTICATED', 'Refresh token expired') };
      const user = await tx.users.byId(row.userId);
      if (!user || user.status !== 'active') {
        await tx.refreshTokens.revokeFamily(row.familyId, now);
        return { error: new DomainError('SESSION_REVOKED') };
      }
      const next = randomToken(32);
      const nextId = ids();
      await tx.refreshTokens.insert({
        id: nextId,
        userId: user.id,
        familyId: row.familyId,
        tokenHash: sha256Hex(next),
        mfa: row.mfa,
        replacedBy: null,
        revokedAt: null,
        expiresAt: row.expiresAt,
        userAgent: userAgent?.slice(0, 200) ?? row.userAgent,
        createdAt: now,
      });
      await tx.refreshTokens.markReplaced(row.id, nextId, now);
      return { user, next, mfa: row.mfa };
    });
    // Errors are thrown after the transaction commits, so a detected reuse stays revoked.
    if ('error' in outcome) throw outcome.error;
    const mfa = outcome.mfa && isStaff(outcome.user.roles) && outcome.user.mfaEnabled;
    return this.session(outcome.user, mfa, outcome.next);
  }

  async logout(token: string): Promise<void> {
    const { db, clock } = this.deps;
    await db.transaction(async (tx) => {
      const row = await tx.refreshTokens.byHash(sha256Hex(token), 'update');
      if (row) await tx.refreshTokens.revokeFamily(row.familyId, clock.now());
    });
  }

  /** Starts authenticator enrollment for a staff member; confirmed by confirmMfa(). */
  async enrollMfa(actor: RequestActor): Promise<{ secret: string; otpauthUri: string }> {
    const { db, cipher } = this.deps;
    const user = await db.read.users.byId(actor.id);
    if (!user) throw new DomainError('NOT_FOUND', 'User not found');
    if (user.mfaEnabled) throw new DomainError('VALIDATION_FAILED', 'Two-factor authentication is already on');
    const secret = generateTotpSecret();
    await db.transaction((tx) => tx.users.update(user.id, { totpSecretCipher: cipher.encrypt(secret, `totp:${user.id}`) }));
    return { secret, otpauthUri: otpauthUri(secret, user.email ?? user.phone ?? user.id) };
  }

  async confirmMfa(actor: RequestActor, code: string): Promise<void> {
    const { db } = this.deps;
    const user = await db.read.users.byId(actor.id);
    if (!user?.totpSecretCipher) throw new DomainError('VALIDATION_FAILED', 'Start enrollment first');
    if (!this.checkTotp(user, code)) throw new DomainError('OTP_INVALID');
    await db.transaction(async (tx) => {
      await tx.users.update(user.id, { mfaEnabled: true });
      await tx.audit.record({
        actorId: user.id,
        actorRole: null,
        action: 'auth.mfa_enabled',
        entityType: 'user',
        entityId: user.id,
        after: { mfaEnabled: true },
      });
    });
  }

  /** Used by the HTTP guard. */
  authenticate(accessToken: string): RequestActor {
    const { config, clock } = this.deps;
    const claims = verifyAccessToken(accessToken, config.jwtSecrets, { issuer: config.issuer, audience: config.audience, now: clock.now() });
    return { id: claims.sub, name: claims.name, roles: claims.roles, mfa: claims.mfa };
  }
}
