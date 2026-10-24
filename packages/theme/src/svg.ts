import { brand, type BrandConfig, type LogoGeometry } from './brand';
import { mix } from './color';
import { andalusianPattern } from './pattern';
import { defaultTheme, type Theme } from './tokens';
import { arabicLockup, arabicWordmark, type WordmarkGeometry } from './wordmark';

export interface MarkColors {
  bowl: string;
  drop: string;
  background?: string;
}

/** Mask that keeps the bowl and cuts the two dots of ي out of it (they stay transparent on any background). */
function dotsMask(logo: LogoGeometry, id: string): string {
  const holes = logo.dots.items.map((dot) => `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="#000"/>`).join('');
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80"><rect x="-8" y="-8" width="80" height="80" fill="#fff"/>${holes}</mask></defs>`;
}

function markPaths(logo: LogoGeometry, colors: MarkColors, maskId = 'yusr-dots'): string {
  const cutout = logo.dots.style === 'cutout';
  const parts = [
    cutout ? dotsMask(logo, maskId) : '',
    `<path d="${logo.bowl.d}" fill="none" stroke="${colors.bowl}" stroke-width="${logo.bowl.strokeWidth}" stroke-linecap="round"${cutout ? ` mask="url(#${maskId})"` : ''}/>`,
    // Solid dots take the curve's colour, so the letter reads as one shape.
    cutout ? '' : logo.dots.items.map((dot) => `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${colors.bowl}"/>`).join(''),
    `<path d="${logo.drop.d}" fill="${colors.drop}" transform="${logo.drop.transform}"/>`,
  ];
  return parts.join('');
}

/** Transform that centres the mark's visual bounds in a square of `size` units, filling `share` of it. */
export function centreMark(logo: LogoGeometry, size: number, share: number): string {
  const scale = (size * share) / 64;
  const cx = logo.bounds.x + logo.bounds.width / 2;
  const cy = logo.bounds.y + logo.bounds.height / 2;
  const round = (value: number) => Math.round(value * 100) / 100;
  return `translate(${round(size / 2 - scale * cx)} ${round(size / 2 - scale * cy)}) scale(${round(scale)})`;
}

/** The mark alone (transparent background unless one is given). */
export function logoMarkSvg(colors?: Partial<MarkColors>, theme: Theme = defaultTheme, config: BrandConfig = brand): string {
  const resolved: MarkColors = {
    bowl: colors?.bowl ?? theme.colors.light.primary,
    drop: colors?.drop ?? theme.colors.light.highlight,
    background: colors?.background,
  };
  const bg = resolved.background ? `<rect width="64" height="64" rx="16" fill="${resolved.background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${config.logo.viewBox}" role="img" aria-label="${config.name.en}">${bg}${markPaths(config.logo, resolved)}</svg>`;
}

/** 1024×1024 app icon: white bowl and gold ḍamma on the primary color. */
export function appIconSvg(theme: Theme = defaultTheme, config: BrandConfig = brand): string {
  const { primary, primaryHover, highlight } = theme.colors.light;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${primaryHover}"/>`,
    '</linearGradient></defs>',
    '<rect width="1024" height="1024" fill="url(#g)"/>',
    `<g transform="${centreMark(config.logo, 1024, 0.625)}">${markPaths(config.logo, { bowl: '#FFFFFF', drop: highlight })}</g>`,
    '</svg>',
  ].join('');
}

/** The Arabic wordmark's shapes: the letters with the dots of ي, and the golden ḍamma. */
export function wordmarkPaths(word: WordmarkGeometry, colors: { ink: string; drop: string }): string {
  return [`<path d="${word.ink.d}" fill="${colors.ink}" fill-rule="evenodd"/>`, `<path d="${word.damma.d}" fill="${colors.drop}" fill-rule="evenodd"/>`].join(
    '',
  );
}

/** A font stack as an XML attribute value (its quoted family names in single quotes). */
const fontAttr = (stack: string) => `"${stack.replace(/"/g, "'")}"`;

/**
 * Where the typeset name sits beside the mark, on a 64-unit-high grid (the mark at the right). The
 * text is anchored by its right edge; `direction="ltr"` keeps that so when the SVG is inlined in a
 * right-to-left page (the Arabic still reads right to left).
 */
const TYPESET = { viewBox: '48 0 152 64', markX: 136, textEnd: 132, baseline: 45, size: 38, centre: 122 };

/**
 * Mark + name. The Arabic name is set in the logo face (Reem Kufi) beside the mark, or — with
 * `wordmark: 'lettered'` — drawn from the approved lettering (paths, no font needed). The English name is
 * set in the logo face. Outline set text in design tools for print.
 */
export function logoLockupSvg(locale: 'ar' | 'en', theme: Theme = defaultTheme, config: BrandConfig = brand): string {
  const { primary, highlight } = theme.colors.light;
  const logoFont = fontAttr(theme.typography.fonts.logo);
  if (locale === 'ar' && config.wordmark === 'typeset') {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${TYPESET.viewBox}" role="img" aria-label="${config.name.ar}">`,
      `<g transform="translate(${TYPESET.markX} 0)">${markPaths(config.logo, { bowl: primary, drop: highlight })}</g>`,
      `<text x="${TYPESET.textEnd}" y="${TYPESET.baseline}" text-anchor="end" direction="ltr" font-family=${logoFont} font-size="${TYPESET.size}" font-weight="700" fill="${primary}">${config.name.ar}</text>`,
      '</svg>',
    ].join('');
  }
  if (locale === 'ar') {
    const word = arabicWordmark();
    const layout = arabicLockup(config.logo, word);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${layout.viewBox}" role="img" aria-label="${config.name.ar}">`,
      wordmarkPaths(word, { ink: primary, drop: highlight }),
      `<g transform="translate(${layout.markX} 0)">${markPaths(config.logo, { bowl: primary, drop: highlight })}</g>`,
      '</svg>',
    ].join('');
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 64" role="img" aria-label="${config.name.en}">`,
    `<g>${markPaths(config.logo, { bowl: primary, drop: highlight })}</g>`,
    `<text x="70" y="45" font-family=${logoFont} font-size="34" font-weight="700" fill="${primary}">${config.name.en}</text>`,
    '</svg>',
  ].join('');
}

export type BackgroundTone = 'brand' | 'light' | 'dark';

export interface LogoBackgroundOptions {
  /** Canvas size in px (default 1920 × 1200). */
  width?: number;
  height?: number;
  /** brand: the white lockup on a deep emerald glow; light / dark: the lockup in its own colours. */
  tone?: BackgroundTone;
  /** Width of the lockup as a share of the canvas width. */
  logoShare?: number;
  /** Pattern tile in px; by default an eighth of the width, so the pattern is symmetric about the centre. */
  tile?: number;
}

/**
 * A wallpaper / screen background: the Arabic lockup centred on a soft glow, with «روضة العطاء»
 * fading in towards the edges (never behind the logo). Lettered paths only, no fonts, so it
 * renders the same everywhere; rasterise it at its own size for a PNG.
 */
export function logoBackgroundSvg(options: LogoBackgroundOptions = {}, theme: Theme = defaultTheme, config: BrandConfig = brand): string {
  const { width = 1920, height = 1200, tone = 'brand', logoShare = config.wordmark === 'typeset' ? 0.46 : 0.38 } = options;
  const tile = options.tile ?? width / 8;
  const { light, dark } = theme.colors;
  const look = {
    brand: {
      centre: mix(light.primary, '#FFFFFF', 0.05),
      edge: mix(light.primary, '#03110E', 0.66),
      ink: '#FFFFFF',
      drop: light.highlight,
      stroke: '#FFFFFF',
      strokeOpacity: 0.085,
      fill: light.highlight,
      // Strong enough to read as gold (not olive) over the emerald.
      fillOpacity: 0.42,
    },
    light: {
      centre: '#FFFFFF',
      edge: mix(light.background, light.primary, 0.07),
      ink: light.primary,
      drop: light.highlight,
      stroke: light.primary,
      strokeOpacity: 0.13,
      fill: light.highlight,
      fillOpacity: 0.34,
    },
    dark: {
      centre: mix(dark.card, dark.primary, 0.1),
      edge: dark.background,
      ink: dark.primary,
      drop: dark.highlight,
      stroke: dark.primary,
      strokeOpacity: 0.12,
      fill: dark.highlight,
      fillOpacity: 0.26,
    },
  }[tone];

  const pattern = andalusianPattern(tile);
  const round = (value: number) => Math.round(value * 100) / 100;
  const id = `yusr-bg-${tone}`;
  let lockupBody: string;
  let tx: number;
  let ty: number;
  let scale: number;
  if (config.wordmark === 'lettered') {
    const word = arabicWordmark();
    const layout = arabicLockup(config.logo, word);
    const [vx, vy] = layout.viewBox.split(' ').map(Number) as [number, number];
    scale = (width * logoShare) / layout.width;
    // Centred on the canvas, a touch above the middle so it sits optically centred.
    tx = round(width / 2 - scale * (vx + layout.width / 2));
    ty = round(height * 0.48 - scale * (vy + layout.height / 2));
    lockupBody = [
      wordmarkPaths(word, { ink: look.ink, drop: look.drop }),
      `<g transform="translate(${layout.markX} 0)">${markPaths(config.logo, { bowl: look.ink, drop: look.drop }, `${id}-dots`)}</g>`,
    ].join('');
  } else {
    // The name is set in the logo face: the file carries a link to it, so a browser shows it as designed.
    const [, , vw] = TYPESET.viewBox.split(' ').map(Number) as [number, number, number];
    scale = (width * logoShare) / vw;
    tx = round(width / 2 - scale * TYPESET.centre);
    ty = round(height * 0.48 - scale * 32);
    lockupBody = [
      `<g transform="translate(${TYPESET.markX} 0)">${markPaths(config.logo, { bowl: look.ink, drop: look.drop }, `${id}-dots`)}</g>`,
      `<text x="${TYPESET.textEnd}" y="${TYPESET.baseline}" text-anchor="end" direction="ltr" font-family=${fontAttr(theme.typography.fonts.logo)} font-size="${TYPESET.size}" font-weight="700" fill="${look.ink}">${config.name.ar}</text>`,
    ].join('');
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${config.name.ar} — ${config.name.en}">`,
    config.wordmark === 'typeset' ? `<style>@import url("https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@700&amp;display=swap");</style>` : '',
    '<defs>',
    `<radialGradient id="${id}-ground" cx="0.5" cy="0.46" r="0.78"><stop offset="0" stop-color="${look.centre}"/><stop offset="1" stop-color="${look.edge}"/></radialGradient>`,
    // The pattern stays out from behind the logo and grows towards the edges.
    `<radialGradient id="${id}-fade" cx="0.5" cy="0.48" r="0.64"><stop offset="0.3" stop-color="#000"/><stop offset="0.95" stop-color="#FFF"/></radialGradient>`,
    `<mask id="${id}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="url(#${id}-fade)"/></mask>`,
    `<pattern id="${id}-tile" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse">`,
    `<path d="${pattern.lattice}" fill="none" stroke="${look.stroke}" stroke-opacity="${look.strokeOpacity}" stroke-width="${round((1.1 * tile) / 144)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${pattern.rosette}${pattern.seeds}" fill="${look.fill}" fill-opacity="${look.fillOpacity}"/>`,
    '</pattern>',
    '</defs>',
    `<rect width="${width}" height="${height}" fill="url(#${id}-ground)"/>`,
    `<rect width="${width}" height="${height}" fill="url(#${id}-tile)" mask="url(#${id}-mask)"/>`,
    `<g transform="translate(${tx} ${ty}) scale(${round(scale)})">`,
    lockupBody,
    '</g>',
    '</svg>',
  ].join('');
}
