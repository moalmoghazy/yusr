import { defineConfig } from 'tsup';

/**
 * File-by-file output (no bundling) so React Server Components work: modules that start
 * with 'use client' keep the directive, and everything else stays usable on the server.
 */
export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx'],
  bundle: false,
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
});
