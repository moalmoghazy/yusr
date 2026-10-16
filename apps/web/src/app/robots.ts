import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';
import { site } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  // A public demo shows fictional cases: keep it out of search results.
  if (site.demo) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/ar/receipt', '/en/receipt'] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
