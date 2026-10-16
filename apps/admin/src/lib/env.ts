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
