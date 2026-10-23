import 'server-only';

/**
 * Server configuration, read on use (not at import) so `next build` works without it.
 * In production a missing API URL fails the first request loudly instead of calling localhost.
 */
export function apiUrl(): string {
  const value = process.env['YUSR_API_URL'];
  if (value) return value.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('YUSR_API_URL is not set');
  return 'http://localhost:4000/v1';
}

/**
 * How long a server request to the API may wait (YUSR_API_TIMEOUT_MS). Raise it (e.g. 90000) when the
 * API sleeps between visits, as on a free host where the first request wakes it up.
 */
export function apiTimeoutMs(): number | undefined {
  const value = Number(process.env['YUSR_API_TIMEOUT_MS']);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * The site's public address (NEXT_PUBLIC_SITE_URL). On Vercel, without it, the production domain
 * Vercel provides (VERCEL_PROJECT_PRODUCTION_URL), so canonical links and link previews never point
 * at localhost.
 */
export function siteUrl(): string {
  const vercel = process.env['VERCEL_PROJECT_PRODUCTION_URL'];
  return (process.env['NEXT_PUBLIC_SITE_URL'] ?? (vercel ? `https://${vercel}` : 'http://localhost:3000')).replace(/\/$/, '');
}

/**
 * Lets the API rate-limit per visitor rather than per web server: the shared secret (YUSR_EDGE_SECRET,
 * the same value as the API's) and the visitor's address from the request headers. Without the
 * secret nothing is sent and the API sees this server's address.
 */
export function apiEdge(incoming: { get(name: string): string | null }): { secret: string; clientIp: string | null } | undefined {
  const secret = process.env['YUSR_EDGE_SECRET'];
  if (!secret) return undefined;
  const clientIp = incoming.get('x-real-ip')?.trim() || incoming.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  return { secret, clientIp };
}
