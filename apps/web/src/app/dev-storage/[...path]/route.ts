import { apiTimeoutMs, apiUrl } from '@/lib/env';

/**
 * Case documents on an API without object storage (the public demo, local runs): the upload link the
 * API signs points at its own /dev-storage, which a browser on the website may not reach (the page's
 * Content-Security-Policy only allows this origin, and the API may not allow it in CORS). The upload
 * action rewrites such links to this route, which passes the signed PUT through to the API unchanged.
 * With real object storage (R2/S3) uploads go straight there and this route is never used.
 */
const MAX_BYTES = 20 * 1024 * 1024;

export async function PUT(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length < 2 || (path[0] !== 'private' && path[0] !== 'public') || path.some((part) => part === '..' || part === '')) {
    return new Response(null, { status: 404 });
  }
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BYTES) return new Response(null, { status: 413 });
  const query = new URL(request.url).search;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(apiTimeoutMs() ?? 15_000, 60_000));
  try {
    const upstream = await fetch(`${new URL(apiUrl()).origin}/dev-storage/${path.map(encodeURIComponent).join('/')}${query}`, {
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
