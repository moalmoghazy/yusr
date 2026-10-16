import type { AuthSession, Role } from '@yusr/core';

/** Cookie names. All httpOnly + SameSite=Strict: tokens never reach browser JavaScript. */
export const ACCESS_COOKIE = 'yusr_at';
export const REFRESH_COOKIE = 'yusr_rt';
export const LOCALE_COOKIE = 'yusr_hub_locale';

const REFRESH_DAYS = 30;

export interface CookieWrite {
  name: string;
  value: string;
  options: { httpOnly: boolean; secure: boolean; sameSite: 'strict'; path: string; maxAge: number };
}

const base = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/', maxAge });

/** The two cookies a session is stored in. The access cookie expires with the token itself. */
export function sessionCookies(session: AuthSession): CookieWrite[] {
  return [
    { name: ACCESS_COOKIE, value: session.accessToken, options: base(session.expiresIn) },
    { name: REFRESH_COOKIE, value: session.refreshToken, options: base(REFRESH_DAYS * 86_400) },
  ];
}

export function clearedCookies(): CookieWrite[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({ name, value: '', options: base(0) }));
}

export interface StaffClaims {
  sub: string;
  name: string;
  roles: Role[];
  mfa: boolean;
  exp: number;
}

/**
 * Reads the access token's claims for display and navigation only. The API verifies the
 * signature on every call; nothing here is trusted for authorization.
 */
export function readClaims(token: string | undefined): StaffClaims | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes)) as Partial<StaffClaims>; // UTF-8: staff names are Arabic
    if (typeof json.sub !== 'string' || !Array.isArray(json.roles) || typeof json.exp !== 'number') return null;
    return { sub: json.sub, name: json.name ?? '', roles: json.roles, mfa: json.mfa === true, exp: json.exp };
  } catch {
    return null;
  }
}
