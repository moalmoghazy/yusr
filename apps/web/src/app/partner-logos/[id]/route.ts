import { apiTimeoutMs, apiUrl } from '@/lib/env';

/**
 * A partner's logo for «شركاء يُسر», passed through from the API (the browser never calls the API
 * directly). Linked with `?v=<logoVersion>`, which changes with every upload, so the API lets browsers
 * and the CDN keep it for a year; its security headers (a sandboxing CSP for SVG) pass through too.
 */
const PASSED = ['content-type', 'cache-control', 'content-security-policy', 'x-content-type-options'];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{1,80}$/.test(id)) return new Response(null, { status: 404 });
  const version = new URL(request.url).searchParams.get('v');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiTimeoutMs() ?? 15_000);
  try {
    const upstream = await fetch(`${apiUrl()}/partners/${encodeURIComponent(id)}/logo${version ? `?v=${encodeURIComponent(version)}` : ''}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!upstream.ok) return new Response(null, { status: upstream.status === 404 ? 404 : 502, headers: { 'cache-control': 'no-store' } });
    const headers = new Headers();
    for (const name of PASSED) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(await upstream.arrayBuffer(), { headers });
  } catch {
    return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } });
  } finally {
    clearTimeout(timer);
  }
}
