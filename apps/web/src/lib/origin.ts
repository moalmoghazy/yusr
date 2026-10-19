import 'server-only';
import { headers } from 'next/headers';
import { siteUrl } from './env';

/**
 * The address this request came in on (https://yusr-eg.vercel.app, a custom domain, localhost…), so
 * links meant to leave the site — shared links above all — point where the visitor actually is.
 * Falls back to NEXT_PUBLIC_SITE_URL when the host header is missing.
 */
export async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get('x-forwarded-host') ?? list.get('host');
  if (!host) return siteUrl();
  const proto = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto.split(',')[0]!.trim()}://${host.split(',')[0]!.trim()}`;
}
