import { DomainError } from '@yusr/core';
import type { Clock } from '../common/clock';
import { sha256Hex } from '../common/crypto';
import type { FetchLike } from '../payments/gateway';
import { verifyRs256, type Jwks } from './jwt';

export type OAuthProvider = 'google' | 'apple';

export interface OAuthIdentity {
  provider: OAuthProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const PROVIDERS: Readonly<Record<OAuthProvider, { jwksUrl: string; issuers: readonly string[] }>> = {
  google: { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'] },
  apple: { jwksUrl: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'] },
};

/**
 * "Sign in with Google / Apple": the app or website sends the provider's ID token;
 * we verify its RS256 signature against the provider's published keys (cached),
 * the issuer, the audience (our client ids), expiry and — when given — the nonce.
 */
export class OAuthVerifier {
  private readonly cache = new Map<OAuthProvider, { jwks: Jwks; fetchedAt: number }>();

  constructor(
    private readonly options: { clientIds: Readonly<Record<OAuthProvider, readonly string[]>>; cacheMs?: number },
    private readonly clock: Clock,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  private async jwks(provider: OAuthProvider, force = false): Promise<Jwks> {
    const cached = this.cache.get(provider);
    const now = this.clock.now().getTime();
    if (!force && cached && now - cached.fetchedAt < (this.options.cacheMs ?? 3_600_000)) return cached.jwks;
    const response = await this.fetchImpl(PROVIDERS[provider].jwksUrl, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new DomainError('UNAUTHENTICATED', `${provider} keys unavailable`);
    const jwks = (await response.json()) as Jwks;
    this.cache.set(provider, { jwks, fetchedAt: now });
    return jwks;
  }

  async verify(provider: OAuthProvider, idToken: string, nonce?: string): Promise<OAuthIdentity> {
    let payload: Record<string, unknown>;
    try {
      payload = verifyRs256(idToken, await this.jwks(provider));
    } catch (error) {
      // Providers rotate keys; refetch once when the key id is unknown.
      if (!DomainError.is(error) || !/Unknown ID token key/.test(error.message)) throw error;
      payload = verifyRs256(idToken, await this.jwks(provider, true));
    }
    const { issuers } = PROVIDERS[provider];
    const audience = Array.isArray(payload['aud']) ? (payload['aud'] as string[]) : [String(payload['aud'])];
    if (!issuers.includes(String(payload['iss']))) throw new DomainError('UNAUTHENTICATED', 'Unexpected issuer');
    if (!audience.some((aud) => this.options.clientIds[provider].includes(aud))) throw new DomainError('UNAUTHENTICATED', 'Token is for another app');
    if (Number(payload['exp']) * 1000 <= this.clock.now().getTime()) throw new DomainError('UNAUTHENTICATED', 'ID token expired');
    if (nonce && payload['nonce'] !== nonce && payload['nonce'] !== sha256Hex(nonce)) throw new DomainError('UNAUTHENTICATED', 'Nonce mismatch');
    const email = typeof payload['email'] === 'string' ? payload['email'] : null;
    const verified = payload['email_verified'] === true || payload['email_verified'] === 'true';
    return { provider, subject: String(payload['sub']), email, emailVerified: verified, name: typeof payload['name'] === 'string' ? payload['name'] : null };
  }
}
