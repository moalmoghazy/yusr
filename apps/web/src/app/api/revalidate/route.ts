import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';

/**
 * The hub calls this after a change visitors should see at once (a case published, paused or closed,
 * its text edited, «يحدث الآن»): the shared `catalog` cache (home page, case lists, case pages) is
 * dropped, so the next visitor gets fresh data instead of waiting up to 20 seconds.
 *
 * Only with the shared secret (YUSR_REVALIDATE_SECRET, the same value on the hub). Without it set,
 * the route answers 404 and the site keeps its 20-second refresh; `next dev` uses a fixed local secret.
 */
const DEV_SECRET = 'yusr-local-revalidate';

function matches(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export async function POST(request: Request) {
  const secret = process.env['YUSR_REVALIDATE_SECRET'] || (process.env.NODE_ENV === 'development' ? DEV_SECRET : '');
  if (!secret) return new Response(null, { status: 404 });
  const given = request.headers.get('x-yusr-revalidate-secret') ?? '';
  if (!matches(given, secret)) return new Response(null, { status: 401 });
  revalidateTag('catalog', { expire: 0 });
  return Response.json({ revalidated: true }, { headers: { 'cache-control': 'no-store' } });
}
