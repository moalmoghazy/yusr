import { apiTimeoutMs, apiUrl } from '@/lib/env';

/**
 * Case documents on an API without object storage (the public demo, local runs). The links the API
 * signs point at its own /dev-storage, which this hub's pages may not reach (the Content-Security-Policy
 * only allows this origin) and which may not be public at all. The hub's case page rewrites such links
 * to this route, which passes the signed request through to the API unchanged:
 *
 * - PUT public/…: a redacted copy uploaded from the case page.
 * - GET private/…: an original opened from the case page (the API checked the person and audited it
 *   when it signed the link; the signature expires in five minutes).
 *
 * With real object storage (R2/S3) the links go straight there and this route is never used.
 */
const MAX_BYTES = 20 * 1024 * 1024;

function upstreamUrl(path: string[], request: Request): string | null {
  if (path.length < 2 || (path[0] !== 'private' && path[0] !== 'public') || path.some((part) => part === '..' || part === '')) return null;
  return `${new URL(apiUrl()).origin}/dev-storage/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`;
}

function timeout(): number {
  return Math.max(apiTimeoutMs() ?? 15_000, 60_000);
}

export async function PUT(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = path[0] === 'public' ? upstreamUrl(path, request) : null;
  if (!url) return new Response(null, { status: 404 });
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BYTES) return new Response(null, { status: 413 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout());
  try {
    const upstream = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/octet-stream' },
      body: await request.arrayBuffer(),
      cache: 'no-store',
      signal: controller.signal,
    });
    return new Response(null, { status: upstream.ok ? 200 : upstream.status === 403 ? 403 : 502, headers: { 'cache-control': 'no-store' } });
  } catch {
    return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = upstreamUrl(path, request);
  if (!url) return new Response(null, { status: 404 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout());
  try {
    const upstream = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!upstream.ok) return new Response(null, { status: upstream.status === 403 ? 403 : upstream.status === 404 ? 404 : 502 });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
