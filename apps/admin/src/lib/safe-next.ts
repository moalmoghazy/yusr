/**
 * Where to go after signing in. `next` comes from the query string, so it must stay a path on this
 * site: anything else (another origin, `//host`, `/\host`, or control characters that browsers strip,
 * as in `/\t/host`) falls back to the overview.
 */
export function safeNext(value: unknown): string {
  const path = typeof value === 'string' ? value : '';
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (!path.startsWith('/') || path.startsWith('//') || /[\x00-\x1f\x7f\\]/.test(path)) return '/';
  try {
    const url = new URL(path, 'http://x');
    if (url.origin !== 'http://x' || !url.pathname.startsWith('/') || url.pathname.startsWith('//')) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}
