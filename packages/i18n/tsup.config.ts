import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2022',
    external: ['@yusr/core'],
  },
  {
    // React bindings keep the "use client" directive so Next.js treats them as client modules.
    entry: ['src/react.tsx'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    target: 'es2022',
    external: ['react', '@yusr/core', './index'],
    banner: { js: '"use client";' },
  },
]);
