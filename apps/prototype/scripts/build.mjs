/**
 * Builds the prototype into ONE self-contained HTML file (dist/index.html):
 * React 19 + the shared @yusr/* packages bundled from source, CSS inlined,
 * design tokens emitted from @yusr/theme, and selected monorepo source files
 * embedded for the in-app code viewer (imported with the `?raw` suffix).
 */
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const rawPlugin = {
  name: 'raw-source',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
      namespace: 'raw-source',
    }));
    build.onLoad({ filter: /.*/, namespace: 'raw-source' }, async (args) => ({
      contents: existsSync(args.path) ? await readFile(args.path, 'utf8') : `// ${args.path} not found`,
      loader: 'text',
    }));
  },
};

// Facts for the architecture page (endpoints, schema, packages, last test run), read from the repo.
execFileSync(process.execPath, ['--conditions=@yusr/source', '--import', 'tsx', join(root, 'scripts/tech-manifest.ts')], { cwd: root, stdio: 'inherit' });

const result = await esbuild.build({
  entryPoints: [join(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  jsx: 'automatic',
  conditions: ['@yusr/source'],
  write: false,
  outdir: join(root, 'build'),
  // Images are inlined as data: URLs so the prototype stays one self-contained file.
  loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [rawPlugin],
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});

const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text ?? '';
const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? '';

// Design tokens (light, dark, system) straight from @yusr/theme so first paint is themed.
const { cssText, defaultTheme } = await import('../../../packages/theme/src/index.ts').catch(
  async () => import(join(root, 'node_modules/@yusr/theme/dist/index.js')),
);
const tokens = cssText(defaultTheme);

const fonts = defaultTheme.typography.googleFontsHref;
const html = `<title>منصة يُسر</title>
<meta name="description" content="Yusr — transparent donation platform: donor web, mobile app and control hub in Arabic and English.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style id="yusr-tokens">${tokens}</style>
<style>${css}</style>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
`;

await mkdir(dist, { recursive: true });
await writeFile(join(dist, 'index.html'), html);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
console.log(`prototype: dist/index.html ${kb(Buffer.byteLength(html))} (js ${kb(js.length)}, css ${kb(css.length)})`);
