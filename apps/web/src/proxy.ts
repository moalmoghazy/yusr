import { createHttpAuthClient } from '@yusr/sdk';
import { NextResponse, type NextRequest } from 'next/server';
import {
  clearedDonorCookies,
  DONOR_ACCESS_COOKIE,
  DONOR_REFRESH_COOKIE,
  donorSessionCookies,
  isFresh,
  readDonorClaims,
  type CookieWrite,
} from './lib/donor-session';
import { apiEdge, apiTimeoutMs, apiUrl } from './lib/env';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from './lib/i18n';

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware):
 *
 * 1. Locale: paths without /ar or /en are redirected to the visitor's language — the one they
 *    chose before (cookie), else the best match in Accept-Language, else Arabic.
 * 2. A signed-in donor's access token about to expire is rotated here, and only here (rotation is
 *    single-use, so prefetches, which could race, skip the proxy). Pages then always see a valid one.
 * 3. Content-Security-Policy with a per-request nonce. Next.js reads the nonce from the request
 *    header and puts it on its own scripts; 'strict-dynamic' lets those load their chunks.
 *    Nothing else can run script on the page — the platform handles money, so no exceptions.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const segment = pathname.split('/')[1];
  if (!isLocale(segment)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale(request)}${pathname === '/' ? '' : pathname}`;
    url.search = search;
    return NextResponse.redirect(url);
  }

  const writes = await refreshDonor(request);
  // Let this very render see the rotated token, not only the next request.
  for (const write of writes) {
    if (write.value) request.cookies.set(write.name, write.value);
    else request.cookies.delete(write.name);
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  for (const write of writes) response.cookies.set(write.name, write.value, write.options);
  return response;
}

async function refreshDonor(request: NextRequest): Promise<CookieWrite[]> {
  const refreshToken = request.cookies.get(DONOR_REFRESH_COOKIE)?.value;
  if (!refreshToken || isFresh(readDonorClaims(request.cookies.get(DONOR_ACCESS_COOKIE)?.value))) return [];
  try {
    const edge = apiEdge(request.headers);
    const auth = createHttpAuthClient({ baseUrl: apiUrl(), timeoutMs: apiTimeoutMs(), ...(edge ? { edge } : {}) });
    return donorSessionCookies(await auth.refresh(refreshToken));
  } catch {
    return clearedDonorCookies();
  }
}

export const config = {
  matcher: [
    {
      // Pages only: not static files, images, metadata routes or /.well-known (app links); not router prefetches.
      source: '/((?!_next/static|_next/image|\\.well-known|favicon.ico|icon|apple-icon|robots.txt|sitemap.xml|.*\\.[a-z0-9]+$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

function preferredLocale(request: NextRequest) {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const ranked = (request.headers.get('accept-language') ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      return { language: tag.toLowerCase().split('-')[0], weight: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .sort((a, b) => b.weight - a.weight);
  const language = ranked.find((entry) => isLocale(entry.language))?.language;
  return isLocale(language) ? language : DEFAULT_LOCALE;
}

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development';
  // Case documents are PUT from the browser straight to object storage (UPLOAD_ORIGIN; in
  // development the API's own /dev-storage).
  const uploads = process.env['UPLOAD_ORIGIN'] ?? (dev ? originOf(process.env['YUSR_API_URL'] ?? 'http://localhost:4000') : undefined);
  const connect = ["'self'", uploads, process.env['NEXT_PUBLIC_POSTHOG_HOST'], process.env['NEXT_PUBLIC_SENTRY_DSN'] && 'https://*.ingest.sentry.io']
    .filter(Boolean)
    .join(' ');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // React style attributes (progress widths) and next/font need inline styles; scripts stay locked.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    // Checkout ends with a redirect to the payment gateway's hosted page.
    "form-action 'self' https:",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
