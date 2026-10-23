import { createHmac, createPublicKey, verify as verifySignature } from 'node:crypto';
import { DomainError, type Role } from '@yusr/core';
import { safeEqual } from '../common/crypto';

/** Claims in a Yusr access token. Short-lived (15 minutes); refresh tokens are opaque and rotated. */
export interface AccessClaims {
  sub: string;
  name: string;
  roles: Role[];
  /** True when this session completed a second factor (required for staff actions). */
  mfa: boolean;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function decodePart<T>(part: string | undefined): T {
  if (!part) throw new DomainError('UNAUTHENTICATED', 'Malformed token');
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  } catch {
    throw new DomainError('UNAUTHENTICATED', 'Malformed token');
  }
}

export function signAccessToken(claims: AccessClaims, secret: string, keyId = 'k1'): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: keyId }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** Verifies an HS256 access token. `secrets` maps key ids to secrets so keys can be rotated. */
export function verifyAccessToken(
  token: string,
  secrets: Readonly<Record<string, string>>,
  expected: { issuer: string; audience: string; now: Date },
): AccessClaims {
  const [headerPart, payloadPart, signature] = token.split('.');
  const header = decodePart<{ alg?: string; kid?: string }>(headerPart);
  if (header.alg !== 'HS256') throw new DomainError('UNAUTHENTICATED', 'Unexpected token algorithm');
  // Own keys only: a kid like "__proto__" or "constructor" must not reach Object.prototype.
  const kid = typeof header.kid === 'string' ? header.kid : 'k1';
  const secret = Object.hasOwn(secrets, kid) ? secrets[kid] : undefined;
  if (typeof secret !== 'string') throw new DomainError('UNAUTHENTICATED', 'Unknown signing key');
  if (!secret || !signature) throw new DomainError('UNAUTHENTICATED', 'Unknown signing key');
  const expectedSignature = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest('base64url');
  if (!safeEqual(expectedSignature, signature)) throw new DomainError('UNAUTHENTICATED', 'Bad token signature');
  const claims = decodePart<AccessClaims>(payloadPart);
  const now = Math.floor(expected.now.getTime() / 1000);
  if (claims.iss !== expected.issuer || claims.aud !== expected.audience) throw new DomainError('UNAUTHENTICATED', 'Token issued for another audience');
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new DomainError('UNAUTHENTICATED', 'Token expired');
  return claims;
}

export interface IdTokenHeader {
  alg: string;
  kid: string;
}

/** An RSA public key as published by Google and Apple (JWKS). */
export interface Jwk {
  kty: string;
  n?: string;
  e?: string;
  kid?: string;
  alg?: string;
  use?: string;
  [member: string]: unknown;
}

export interface Jwks {
  keys: Array<Jwk>;
}

/** Verifies an RS256 ID token (Google, Apple) against a JWKS and returns its payload. */
export function verifyRs256(token: string, jwks: Jwks): Record<string, unknown> {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  const header = decodePart<IdTokenHeader>(headerPart);
  if (header.alg !== 'RS256') throw new DomainError('UNAUTHENTICATED', 'Unexpected ID token algorithm');
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk || !signaturePart) throw new DomainError('UNAUTHENTICATED', 'Unknown ID token key');
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(signaturePart, 'base64url'),
  );
  if (!valid) throw new DomainError('UNAUTHENTICATED', 'Bad ID token signature');
  return decodePart<Record<string, unknown>>(payloadPart);
}
