import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Security headers that don't depend on the request. The Content-Security-Policy is per
 * request (it carries a nonce) and is set in src/proxy.ts.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // A public demo (fictional cases) stays out of search results.
  ...(process.env['NEXT_PUBLIC_DEMO'] === 'true' ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] : []),
];

const config: NextConfig = {
  reactStrictMode: true,
  // A self-contained server for the Docker image (infra/docker/next.Dockerfile sets NEXT_OUTPUT);
  // tracing starts at the monorepo root so the workspace packages are included. Vercel and
  // `pnpm start` use the regular output.
  ...(process.env['NEXT_OUTPUT'] === 'standalone' ? { output: 'standalone' as const } : {}),
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  poweredByHeader: false,
  // @yusr/ui ships per-file ESM with 'use client' boundaries intact; let Next compile it with the app.
  transpilePackages: ['@yusr/ui'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
