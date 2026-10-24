import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_DISPLAY_FACE,
  DISPLAY_FACES,
  displayFaceOf,
  withDisplayFace,
  LOGO_VARIANTS,
  andalusianPattern,
  arabicLockup,
  arabicWordmark,
  dammaPath,
  displayStack,
  logoBackgroundSvg,
  logoLockupSvg,
  wordmark,
  patternStyleFor,
  patternTileSvg,
  appIconSvg,
  auditContrast,
  brand,
  centreMark,
  logoMarkSvg,
  contrastFailures,
  contrastRatio,
  cssText,
  cssVariables,
  defaultTheme,
  ensureContrast,
  presets,
  tailwindThemeCss,
  themeFromBrandColors,
  toNativeTheme,
  type LogoGeometry,
  type Theme,
} from '../src/index';

function auditTheme(theme: Theme) {
  return contrastFailures(theme);
}

describe('accessibility', () => {
  it('computes WCAG contrast ratios', () => {
    assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(1), '21.0');
    assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  });

  it('keeps every text/background pair of the default theme at AA or better', () => {
    assert.deepEqual(auditTheme(defaultTheme), []);
  });

  for (const [name, preset] of Object.entries(presets)) {
    it(`keeps the "${name}" preset at AA`, () => {
      assert.deepEqual(auditTheme(preset), []);
    });
  }

  it('audits every documented pair in both schemes, including category tones', () => {
    const results = auditContrast(defaultTheme);
    assert.equal(results.length, 2 * (21 + 5));
    assert.ok(results.every((result) => result.ratio >= 1 && result.ratio <= 21));
  });

  it('repairs a brand color that is too light for white text', () => {
    const fixed = ensureContrast('#7FD6C2', '#FFFFFF', 4.5);
    assert.ok(contrastRatio(fixed, '#FFFFFF') >= 4.5);
    const theme = themeFromBrandColors({ name: 'mint', primary: '#9BE3D0', highlight: '#FFD166' });
    assert.deepEqual(auditTheme(theme), []);
  });
});

describe('outputs', () => {
  it('emits light, dark and system blocks with every token', () => {
    const css = cssText(defaultTheme);
    assert.match(css, /:root \{\n {2}color-scheme: light;/);
    assert.match(css, /:root\[data-theme="dark"\],\n\.dark \{/);
    assert.match(css, /@media \(prefers-color-scheme: dark\)/);
    for (const name of Object.keys(cssVariables(defaultTheme, 'light'))) {
      assert.ok(css.includes(`${name}:`), `missing ${name}`);
    }
  });

  it('maps every color into the Tailwind theme', () => {
    const css = tailwindThemeCss(defaultTheme);
    assert.match(css, /--color-primary-soft-foreground: var\(--primary-soft-foreground\);/);
    assert.match(css, /--color-chart-1: var\(--chart-1\);/);
    assert.match(css, /--radius-card: var\(--y-radius-card\);/);
  });

  it('builds a native theme with numeric tokens', () => {
    const native = toNativeTheme(defaultTheme, 'dark');
    assert.equal(native.colors.background, defaultTheme.colors.dark.background);
    assert.equal(native.space(4), 16);
    assert.equal(typeof native.radius.card, 'number');
  });
});

describe('logo geometry', () => {
  const outerBottom = (logo: LogoGeometry) => logo.guides.bowl.cy + logo.guides.bowl.ry + logo.bowl.strokeWidth / 2;

  it('places the solid dots of ي under the curve, close together and centred', () => {
    const logo = LOGO_VARIANTS.dotsBelow;
    const [left, right] = logo.dots.items;
    assert.equal(logo.dots.style, 'solid');
    assert.equal(left.cy, right.cy);
    assert.equal((left.cx + right.cx) / 2, logo.guides.bowl.cx, 'centred under the lowest point');
    const gap = right.cx - left.cx - left.r - right.r;
    assert.ok(gap > 1 && gap < left.r, `dots sit close together (gap ${gap})`);
    const clearance = left.cy - left.r - outerBottom(logo);
    assert.ok(clearance > 2 && clearance < 4, `dots hang just below the stroke (clearance ${clearance})`);
    const bottom = logo.bounds.y + logo.bounds.height;
    assert.ok(Math.abs(bottom - (left.cy + left.r)) < 0.01, 'bounds include the dots');
    assert.ok(bottom < 64 - 5 && logo.bounds.y > 5, 'the mark keeps a margin inside the 64-unit square');
  });

  it('keeps the previous cut-out variant on the curve’s centre line', () => {
    const logo = LOGO_VARIANTS.dotsInCurve;
    const { cx, cy, rx, ry } = logo.guides.bowl;
    for (const dot of logo.dots.items) {
      const onEllipse = ((dot.cx - cx) / rx) ** 2 + ((dot.cy - cy) / ry) ** 2;
      assert.ok(Math.abs(onEllipse - 1) < 0.01, `dot at ${dot.cx} lies on the curve`);
      assert.ok(dot.r * 2 < logo.bowl.strokeWidth, 'the hole stays inside the stroke');
    }
  });

  it('draws solid dots in the curve colour and centres the mark in the app icon', () => {
    const mark = logoMarkSvg({ bowl: '#123456', drop: '#ABCDEF' });
    assert.equal(mark.match(/<circle [^>]*fill="#123456"/g)?.length, 2);
    assert.ok(!mark.includes('<mask'), 'solid dots need no mask');
    assert.equal(brand.logo, LOGO_VARIANTS.dotsBelow);
    const icon = appIconSvg();
    const transform = centreMark(brand.logo, 1024, 0.625);
    assert.ok(icon.includes(transform));
    const [, tx, ty, scale] = /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/.exec(transform)!.map(Number) as [number, number, number, number];
    const { x, y, width, height } = brand.logo.bounds;
    assert.ok(Math.abs(tx + scale * (x + width / 2) - 512) < 0.1 && Math.abs(ty + scale * (y + height / 2) - 512) < 0.1);
    const cutout = logoMarkSvg(undefined, defaultTheme, { ...brand, logo: LOGO_VARIANTS.dotsInCurve });
    assert.ok(cutout.includes('<mask') && cutout.includes('mask="url(#yusr-dots)"'));
  });
});

describe('wordmark', () => {
  const logo = brand.logo;
  const numbers = (d: string) => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);

  it('is the approved lettering: the letters in one filled shape, the ḍamma with its counter open', () => {
    assert.ok(wordmark.ink.d.startsWith('M') && wordmark.ink.d.endsWith('Z'));
    assert.ok((wordmark.ink.d.match(/M/g) ?? []).length >= 2, 'the letters and the dots of ي');
    assert.equal((wordmark.damma.d.match(/M/g) ?? []).length, 2, 'the ḍamma and its counter');
    assert.deepEqual(arabicWordmark(), wordmark);
  });

  it('keeps every point inside its bounds, left of the mark and within the mark’s height', () => {
    const { x, y, width, height } = wordmark.bounds;
    for (const d of [wordmark.ink.d, wordmark.damma.d]) {
      const values = numbers(d);
      const xs = values.filter((_, i) => i % 2 === 0);
      const ys = values.filter((_, i) => i % 2 === 1);
      assert.ok(Math.min(...xs) >= x - 0.6 && Math.max(...xs) <= x + width + 0.6, 'x within bounds');
      assert.ok(Math.min(...ys) >= y - 0.6 && Math.max(...ys) <= y + height + 0.6, 'y within bounds');
    }
    assert.ok(x + width < logo.bounds.x, 'the word ends before the mark begins');
    assert.ok(y > logo.bounds.y && y + height < logo.bounds.y + logo.bounds.height, 'the word sits within the mark’s height');
    const [dammaX = NaN, dammaY = NaN] = numbers(wordmark.damma.d);
    assert.ok(dammaY < 26 && dammaX > x + width / 2, 'the ḍamma floats above the right of the word, over the ي');
  });

  it('locks up with the mark on the right, both on one grid, and letters the Arabic asset', () => {
    const layout = arabicLockup();
    assert.ok(layout.markX + logo.bounds.x > wordmark.bounds.x + wordmark.bounds.width, 'the mark sits right of the word');
    const [vx, vy, vw, vh] = layout.viewBox.split(' ').map(Number) as [number, number, number, number];
    assert.ok(
      vx <= wordmark.bounds.x &&
        vy <= logo.bounds.y &&
        vx + vw >= layout.markX + logo.bounds.x + logo.bounds.width &&
        vy + vh >= wordmark.bounds.y + wordmark.bounds.height,
    );
    const lettered = logoLockupSvg('ar');
    assert.ok(!lettered.includes('<text'), 'the lettered name needs no font');
    assert.ok(lettered.includes(wordmark.ink.d) && lettered.includes('fill-rule="evenodd"') && lettered.includes(`translate(${layout.markX} 0)`));
  });

  it('letters the Arabic name by default; the typeset name and the English name use the logo face', () => {
    assert.equal(brand.wordmark, 'lettered');
    const ar = logoLockupSvg('ar', defaultTheme, { ...brand, wordmark: 'typeset' });
    assert.match(ar, /<text [^>]*font-family="'Reem Kufi', 'IBM Plex Sans Arabic'/, 'the logo face, as a valid XML attribute');
    assert.ok(ar.includes('>يُسر</text>') && ar.includes('translate(136 0)'), 'the mark on the right, the name beside it');
    assert.ok(logoLockupSvg('en').includes('Reem Kufi') && logoLockupSvg('en').includes('>Yusr</text>'));
    const cairo = withDisplayFace(defaultTheme, 'cairo');
    assert.equal(cairo.typography.fonts.logo, defaultTheme.typography.fonts.logo, 'switching headings keeps the logo face');
    assert.equal(cairo.typography.nativeFonts.logo, 'ReemKufi_700Bold');
    assert.ok(cairo.typography.googleFontsHref.includes('family=Reem+Kufi:wght@700'), 'the logo face still loads');
    assert.ok(cssText(defaultTheme).includes('--y-font-logo: "Reem Kufi"'));
    assert.ok(tailwindThemeCss(defaultTheme).includes('--font-logo: var(--y-font-logo);'));
  });
});

describe('the ḍamma', () => {
  it('is written as a round head with a tail level with its bottom, and turns as a whole', () => {
    const level = dammaPath(0, 0, 10);
    assert.equal((level.match(/M/g) ?? []).length, 2);
    assert.ok(level.includes('A10 10 0 1 1 -10 0'), 'the head is a circle of the given radius');
    assert.ok(level.includes('L-20 10'), 'the tail reaches twice the radius to the left, its lower edge on the head’s bottom');
    assert.notEqual(dammaPath(0, 0, 10, { angle: -45 }), level);
  });

  it('crowns the mark as the golden drop, floating over the bowl’s mouth', () => {
    const { drop, bowl } = brand.logo.guides;
    assert.ok(drop.cy + drop.r < bowl.cy, 'the drop floats above the bowl’s ends');
    assert.ok(Math.abs(drop.cx - bowl.cx) < drop.r, 'over the middle of the bowl');
    assert.equal((brand.logo.drop.d.match(/M/g) ?? []).length, 1, 'one drop, not a head and a tail');
    assert.match(brand.logo.drop.transform, /rotate\(-145 /, 'its point turned up to the left');
  });
});

describe('display faces', () => {
  it('sets headings in the text family’s bold by default, with the alternatives one switch away', () => {
    assert.ok(defaultTheme.typography.fonts.display.startsWith('"IBM Plex Sans Arabic"'));
    assert.equal(defaultTheme.typography.fonts.display, defaultTheme.typography.fonts.sans.replace(', Arial', ''), 'the same stack as the text');
    assert.equal(defaultTheme.typography.googleFontsHref.split('IBM+Plex+Sans+Arabic').length, 2, 'loaded once, with the text');
    assert.equal(defaultTheme.typography.nativeFonts.display, 'IBMPlexSansArabic_700Bold');
    assert.equal(displayFaceOf(defaultTheme), DEFAULT_DISPLAY_FACE);
    for (const face of Object.keys(DISPLAY_FACES) as Array<keyof typeof DISPLAY_FACES>) {
      assert.ok(displayStack(face).includes('"IBM Plex Sans Arabic"'), `${face} falls back to the text face`);
    }
  });

  it('makes a screen background with the lockup centred and the pattern kept away from it', () => {
    const typeset = logoBackgroundSvg({}, defaultTheme, { ...brand, wordmark: 'typeset' });
    assert.ok(
      typeset.includes('>يُسر</text>') && typeset.includes('@import url("https://fonts.googleapis.com/css2?family=Reem+Kufi'),
      'the set name carries its face',
    );
    const svg = logoBackgroundSvg({}, defaultTheme, { ...brand, wordmark: 'lettered' });
    assert.match(svg, /^<svg [^>]*width="1920" height="1200" viewBox="0 0 1920 1200"/);
    assert.ok(!svg.includes('<text'), 'lettered, so it renders the same without fonts');
    assert.ok(svg.includes(wordmark.ink.d) && svg.includes(brand.logo.bowl.d));
    assert.ok(svg.includes('stroke="#FFFFFF"'), 'the brand tone draws the lockup in white');
    assert.ok(svg.includes('<pattern id="yusr-bg-brand-tile" width="240" height="240"'), 'eight tiles across: symmetric about the centre');
    assert.ok(svg.includes('mask="url(#yusr-bg-brand-mask)"'));
    const [, tx, , scale] = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">/.exec(svg)!.map(Number) as [number, number, number, number];
    const layout = arabicLockup();
    const [vx] = layout.viewBox.split(' ').map(Number) as [number];
    assert.ok(Math.abs(tx + scale * (vx + layout.width / 2) - 960) < 1, 'centred horizontally');
    const lightSvg = logoBackgroundSvg({ tone: 'light', width: 1280, height: 800 }, defaultTheme, { ...brand, wordmark: 'lettered' });
    assert.ok(lightSvg.includes(`stroke="${defaultTheme.colors.light.primary}"`) && lightSvg.includes('width="160"'));
  });

  it('switches the heading face in one call, for the web and for native', () => {
    const nile = withDisplayFace(presets.nile, 'cairo');
    assert.equal(displayFaceOf(nile), 'cairo');
    assert.ok(nile.typography.fonts.display.startsWith('"Cairo"'));
    assert.ok(nile.typography.googleFontsHref.includes('family=Cairo') && !nile.typography.googleFontsHref.includes('Lemonada'));
    assert.ok(nile.typography.googleFontsHref.includes('IBM+Plex+Sans+Arabic'), 'the text faces stay');
    assert.equal(nile.typography.nativeFonts.display, 'Cairo_700Bold');
    assert.equal(nile.typography.nativeFonts.regular, defaultTheme.typography.nativeFonts.regular);
    assert.deepEqual(nile.colors, presets.nile.colors, 'colours are untouched');
    assert.ok(cssText(nile).includes('--y-font-display: "Cairo"'));
    assert.equal(withDisplayFace(defaultTheme, DEFAULT_DISPLAY_FACE), defaultTheme, 'no change, same theme');
    const plex = withDisplayFace(defaultTheme, 'plexArabic').typography.googleFontsHref;
    assert.equal(plex.split('IBM+Plex+Sans+Arabic').length, 2, 'the text face is not requested twice');
  });
});

describe('brand pattern', () => {
  it('repeats seamlessly: every strapwork line ends on an edge midpoint or a shared corner', () => {
    const { lattice } = andalusianPattern(144);
    const segments = [...lattice.matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)(?=M|$)/g)].map((match) => match.slice(1).map(Number));
    assert.equal(segments.length, 8, 'four straight on, four to the corners');
    const ends = segments.map(([, , x, y]) => `${x},${y}`).sort();
    assert.deepEqual(ends, ['0,0', '0,144', '0,72', '144,0', '144,144', '144,72', '72,0', '72,144'].sort());
  });

  it('holds a rosette of seven drops — the seven ears — and a seed at each corner', () => {
    const geometry = andalusianPattern(144);
    assert.equal(geometry.rosette.match(/M/g)?.length, 7);
    assert.equal(geometry.seeds.match(/M/g)?.length, 4);
  });

  it('draws in the theme’s colours, quietly, and can leave the rosettes out', () => {
    const light = patternTileSvg(patternStyleFor(defaultTheme, 'light'));
    assert.ok(light.includes(`stroke="${defaultTheme.colors.light.primary}"`) && light.includes(`fill="${defaultTheme.colors.light.highlight}"`));
    const full = patternTileSvg({ stroke: '#000', fill: '#000' });
    const lattice = patternTileSvg({ stroke: '#000', fill: '#000', detail: 'lattice' });
    assert.ok(lattice.length < full.length);
    assert.ok(cssText(defaultTheme).includes('--y-pattern: url("data:image/svg+xml,'));
  });
});
