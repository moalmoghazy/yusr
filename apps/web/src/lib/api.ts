import 'server-only';
import type { Locale } from '@yusr/core';
import { createHttpClient, type YusrClient } from '@yusr/sdk';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { DONOR_ACCESS_COOKIE, isFresh, readDonorClaims, type DonorClaims } from './donor-session';
import { apiEdge, apiTimeoutMs, apiUrl } from './env';

/**
 * The typed SDK client, server side only (the browser never talks to the API directly).
 *
 * - `catalog` reads (stats, lists, case pages, the live feed) go through Next's data cache for
 *   a few seconds, so a burst of visitors costs the API one request per page and locale.
 * - `live` never caches: donations, receipts — anything that belongs to one person. It also tells the
 *   API who the visitor is (`apiEdge`), so rate limits count each visitor, not this server, and acts
 *   as the signed-in donor when there is one, so their gifts land in «عطائي». `catalog` does not: it
 *   is shared between visitors and must not read the request.
 */
export const catalog = cache((locale: Locale): YusrClient =>
  createHttpClient({
    baseUrl: apiUrl(),
    locale,
    timeoutMs: apiTimeoutMs(),
    fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 20, tags: ['catalog'] } }),
  }),
);

export const live = cache(async (locale: Locale): Promise<YusrClient> => {
  const [incoming, jar] = await Promise.all([headers(), cookies()]);
  const edge = apiEdge(incoming);
  const token = jar.get(DONOR_ACCESS_COOKIE)?.value || null;
  return createHttpClient({
    baseUrl: apiUrl(),
    locale,
    timeoutMs: apiTimeoutMs(),
    ...(edge ? { edge } : {}),
    getAccessToken: () => token,
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  });
});

/** The signed-in donor's name and id from their access token (display only), or null for a guest. */
export const currentDonor = cache(async (): Promise<DonorClaims | null> => {
  const claims = readDonorClaims((await cookies()).get(DONOR_ACCESS_COOKIE)?.value);
  return isFresh(claims) ? claims : null;
});
