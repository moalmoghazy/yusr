import 'server-only';
import type { Locale } from '@yusr/core';
import { createHttpClient, type YusrClient } from '@yusr/sdk';
import { cache } from 'react';
import { apiTimeoutMs, apiUrl } from './env';

/**
 * The typed SDK client, server side only (the browser never talks to the API directly).
 *
 * - `catalog` reads (stats, lists, case pages, the live feed) go through Next's data cache for
 *   a few seconds, so a burst of visitors costs the API one request per page and locale.
 * - `live` never caches: donations, receipts — anything that belongs to one person.
 */
export const catalog = cache((locale: Locale): YusrClient =>
  createHttpClient({
    baseUrl: apiUrl(),
    locale,
    timeoutMs: apiTimeoutMs(),
    fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 20, tags: ['catalog'] } }),
  }),
);

export const live = cache((locale: Locale): YusrClient =>
  createHttpClient({ baseUrl: apiUrl(), locale, timeoutMs: apiTimeoutMs(), fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }),
);
