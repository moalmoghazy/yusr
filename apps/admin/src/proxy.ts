import { createHttpAuthClient } from '@yusr/sdk';
import { NextResponse, type NextRequest } from 'next/server';
import { apiEdge, apiTimeoutMs, apiUrl } from './lib/env';
import { ACCESS_COOKIE, clearedCookies, readClaims, REFRESH_COOKIE, sessionCookies, type CookieWrite } from './lib/tokens';

/**
 * The hub's gate (Next.js 16 proxy), in front of every page and server action:
 *
 * - No session → /login (remembering where the person was going).
 * - Access token expired or about to → rotate it with the refresh token, here and only here, so
 *   pages always render with a valid token. Rotation is single-use: a reused refresh token makes
 *   the API revoke the whole login, which is why prefetches (which could race) skip the proxy.
 * - A strict, nonce-based Content-Security-Policy.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const onLogin = pathname === '/login';
  const claims = readClaims(request.cookies.get(ACCESS_COOKIE)?.value);
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const fresh = claims !== null && claims.exp * 1000 - Date.now() > 60_000;

  let writes: CookieWrite[] = [];
  if (!fresh && refreshToken) {
    try {
      const edge = apiEdge(request.headers);
      const auth = createHttpAuthClient({ baseUrl: apiUrl(), timeoutMs: apiTimeoutMs(), ...(edge ? { edge } : {}) });
      writes = sessionCookies(await auth.refresh(refreshToken));
    } catch {
      writes = clearedCookies();
    }
  }
  const signedIn = fresh || writes.some((write) => write.name === ACCESS_COOKIE && write.value !== '');

  if (!signedIn && !onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return withCookies(NextResponse.redirect(url), writes);
  }
  if (signedIn && onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return withCookies(NextResponse.redirect(url), writes);
  }

  // Let this very render see the rotated token, not only the next request.
  for (const write of writes) {
    if (write.value) request.cookies.set(write.name, write.value);
    else request.cookies.delete(write.name);
  }
  const nonce = btoa(crypto.randomUUID());
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  return withCookies(response, writes);
}

function withCookies(response: NextResponse, writes: CookieWrite[]): NextResponse {
  for (const write of writes) response.cookies.set(write.name, write.value, write.options);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon|.*\\.[a-z0-9]+$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
