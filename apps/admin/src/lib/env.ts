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
 * Lets the API rate-limit per visitor rather than per hub server: the shared secret (YUSR_EDGE_SECRET,
 * the same value as the API's) and the visitor's address from the request headers. Without the
 * secret nothing is sent and the API sees this server's address.
 */
export function apiEdge(incoming: { get(name: string): string | null }): { secret: string; clientIp: string | null } | undefined {
  const secret = process.env['YUSR_EDGE_SECRET'];
  if (!secret) return undefined;
  const clientIp = incoming.get('x-real-ip')?.trim() || incoming.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  return { secret, clientIp };
}
