import { cookies } from 'next/headers';
import { apiTimeoutMs, apiUrl } from '@/lib/env';
import { ACCESS_COOKIE } from '@/lib/tokens';

/**
 * A partner's logo for «شركاء الموقع», fetched as the signed-in staff member (the browser never calls
 * the API directly). Hidden partners' logos show here too, unlike on the website.
 */
const PASSED = ['content-type', 'cache-control', 'content-security-policy', 'x-content-type-options'];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || !/^[\w-]{1,80}$/.test(id)) return new Response(null, { status: 404 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiTimeoutMs() ?? 15_000);
  try {
    const upstream = await fetch(`${apiUrl()}/admin/partners/${encodeURIComponent(id)}/logo`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
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
