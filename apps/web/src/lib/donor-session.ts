import type { AuthSession } from '@yusr/core';

/**
 * A donor's sign-in on the website, kept in two httpOnly cookies so tokens never reach browser
 * JavaScript. SameSite=Lax (not Strict, as in the hub): a donor coming back from the payment
 * gateway's page should still be signed in, and server actions are POSTs, which Lax never sends
 * cross-site.
 */
export const DONOR_ACCESS_COOKIE = 'yusr_donor_at';
export const DONOR_REFRESH_COOKIE = 'yusr_donor_rt';

const REFRESH_DAYS = 30;

export interface CookieWrite {
  name: string;
  value: string;
  options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number };
}

const base = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge });

export function donorSessionCookies(session: AuthSession): CookieWrite[] {
  return [
    { name: DONOR_ACCESS_COOKIE, value: session.accessToken, options: base(session.expiresIn) },
    { name: DONOR_REFRESH_COOKIE, value: session.refreshToken, options: base(REFRESH_DAYS * 86_400) },
  ];
}

export function clearedDonorCookies(): CookieWrite[] {
  return [DONOR_ACCESS_COOKIE, DONOR_REFRESH_COOKIE].map((name) => ({ name, value: '', options: base(0) }));
}

export interface DonorClaims {
  sub: string;
  name: string;
  exp: number;
}

/**
 * The access token's claims, for display only (the header's «عطائي» link, the greeting). The API
 * verifies the signature on every call; nothing here decides what a person may see.
 */
export function readDonorClaims(token: string | undefined): DonorClaims | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes)) as Partial<DonorClaims>; // UTF-8: names are Arabic
    if (typeof json.sub !== 'string' || typeof json.exp !== 'number') return null;
    return { sub: json.sub, name: typeof json.name === 'string' ? json.name : '', exp: json.exp };
  } catch {
    return null;
  }
}

/** Still good for at least a minute, so a page never renders with a token about to lapse. */
export function isFresh(claims: DonorClaims | null, now = Date.now()): claims is DonorClaims {
  return claims !== null && claims.exp * 1000 - now > 60_000;
}
