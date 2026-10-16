// One ESLint configuration for the whole monorepo: `pnpm lint` (and the editor, on save).
// Formatting is Prettier's job (.prettierrc.json); eslint-config-prettier turns off the rules that
// would fight it. Type checking is TypeScript's job (`pnpm typecheck`), so these rules stay fast.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/build/',
    '**/.next/',
    '**/.expo/',
    '**/.turbo/',
    '**/coverage/',
    '**/next-env.d.ts',
    '**/expo-env.d.ts',
    'apps/mobile/ios/',
    'apps/mobile/android/',
    'packages/api/drizzle-draft/',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two classic hook rules: hooks are called unconditionally, effects list what they read.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // `_name` marks a parameter or binding that is unused on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      // Non-null assertions are used deliberately after explicit checks (see noUncheckedIndexedAccess).
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },

  // The two Next.js apps: Next's own rules (links, images, scripts, Core Web Vitals).
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    settings: { next: { rootDir: ['apps/web/', 'apps/admin/'] } },
    rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs['core-web-vitals'].rules },
  },

  // Command-line scripts and the API's bootstrap print to the console on purpose.
  {
    files: ['**/scripts/**', 'scripts/**', 'packages/api/src/**/*.main.ts', 'packages/api/src/main.ts', 'packages/api/src/db/*.ts', '**/test/**'],
    rules: { 'no-console': 'off' },
  },

  // Tests read loosely shaped JSON.
  {
    files: ['**/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  // React Native loads static images and conditional polyfills with require().
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // CommonJS files (Metro, Babel and other tool configs).
  {
    files: ['**/*.cjs', 'apps/mobile/*.js', 'packages/api/api/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  prettier,
);
