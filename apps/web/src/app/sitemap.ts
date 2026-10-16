import { LOCALES, type CaseSummary } from '@yusr/core';
import type { MetadataRoute } from 'next';
import { catalog } from '@/lib/api';
import { siteUrl } from '@/lib/env';

/**
 * Regenerated on request at most once an hour, so new cases reach search engines without a deploy.
 * The build never depends on the API: if it is unreachable (or not configured yet) the sitemap lists
 * the fixed pages and fills in the cases on its next regeneration.
 */
export const revalidate = 3600;

/** Pages of 50 (the API's maximum), up to a ceiling that keeps one sitemap file well under the 50,000-URL limit. */
const MAX_CASES = 5_000;

async function openCases(): Promise<CaseSummary[]> {
  const cases: CaseSummary[] = [];
  try {
    const client = catalog('ar');
    let cursor: string | null = null;
    do {
      const page = await client.listCases({ sort: 'newest', limit: 50, cursor });
      cases.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor && cases.length < MAX_CASES);
  } catch {
    // Keep whatever was read; the fixed pages are always listed.
  }
  return cases;
}

/** Home, catalog, the submission page and every open case, in both languages (with hreflang alternates). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entry = (path: string, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: `${base}/ar${path}`,
    lastModified,
    alternates: { languages: Object.fromEntries(LOCALES.map((locale) => [locale, `${base}/${locale}${path}`])) },
  });
  const cases = await openCases();
  return [entry(''), entry('/cases'), entry('/submit'), ...cases.map((item) => entry(`/cases/${item.slug}`, item.publishedAt ?? undefined))];
}
