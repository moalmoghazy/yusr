/**
 * Emits the static stylesheets consumed by the Next.js apps:
 *   dist/tokens.css   — CSS variables (light, dark, system)
 *   dist/tailwind.css — Tailwind v4 @theme mapping
 * and regenerates the SVG brand assets in assets/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appIconSvg,
  cssText,
  defaultTheme,
  logoBackgroundSvg,
  logoLockupSvg,
  logoMarkSvg,
  patternStyleFor,
  patternTileSvg,
  tailwindThemeCss,
} from '../src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const assets = join(root, 'assets');
mkdirSync(dist, { recursive: true });
mkdirSync(assets, { recursive: true });

writeFileSync(join(dist, 'tokens.css'), `${cssText(defaultTheme)}\n`);
writeFileSync(join(dist, 'tailwind.css'), tailwindThemeCss(defaultTheme));

writeFileSync(join(assets, 'logo-mark.svg'), logoMarkSvg());
writeFileSync(join(assets, 'logo-mark-inverse.svg'), logoMarkSvg({ bowl: '#FFFFFF' }));
writeFileSync(join(assets, 'logo-ar.svg'), logoLockupSvg('ar'));
writeFileSync(join(assets, 'logo-en.svg'), logoLockupSvg('en'));
writeFileSync(join(assets, 'app-icon.svg'), appIconSvg());
writeFileSync(join(assets, 'pattern.svg'), patternTileSvg(patternStyleFor(defaultTheme, 'light')));
writeFileSync(join(assets, 'pattern-dark.svg'), patternTileSvg(patternStyleFor(defaultTheme, 'dark')));
// Full-strength construction tile, for print and design tools.
writeFileSync(
  join(assets, 'pattern-tile.svg'),
  patternTileSvg({ stroke: defaultTheme.colors.light.primary, fill: defaultTheme.colors.light.highlight, strokeWidth: 1.4 }),
);
// Screen backgrounds (desktop wallpaper, event screens, video calls): 1920 × 1200, vector.
mkdirSync(join(assets, 'backgrounds'), { recursive: true });
for (const tone of ['brand', 'light', 'dark'] as const) {
  writeFileSync(join(assets, 'backgrounds', `yusr-background-1920x1200-${tone}.svg`), logoBackgroundSvg({ tone }));
}

console.log('theme: wrote dist/tokens.css, dist/tailwind.css, assets/*.svg and assets/backgrounds/*.svg');
