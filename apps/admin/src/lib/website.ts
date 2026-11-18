import 'server-only';

/** Used only by `next dev` when no secret is set, so a local run works without setup. */
const DEV_SECRET = 'yusr-local-revalidate';

/**
 * Asks the website to drop its cached case lists and pages (POST {YUSR_WEB_URL}/api/revalidate), so a
 * case published, paused, closed or edited here shows to visitors at once instead of within 20 seconds.
 * Best effort: a failure is logged and never fails the staff member's action (the site refreshes on
 * its own within 20 seconds anyway).
 */
export async function refreshWebsite(): Promise<void> {
  const dev = process.env.NODE_ENV === 'development';
  const site = process.env['YUSR_WEB_URL'] || (dev ? 'http://localhost:3000' : '');
  const secret = process.env['YUSR_REVALIDATE_SECRET'] || (dev ? DEV_SECRET : '');
  if (!site || !secret) return;
  try {
    const response = await fetch(`${site.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-yusr-revalidate-secret': secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.warn(`refreshWebsite: the site answered ${response.status}`);
  } catch (error) {
    console.warn('refreshWebsite failed', error instanceof Error ? error.message : error);
  }
}
