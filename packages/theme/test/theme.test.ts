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
  const baseline = logo.guides.bowl.cy + logo.guides.bowl.ry;
  const numbers = (d: string) => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);

  it('is lettered in the mark’s own stroke, sitting on the bowl’s baseline', () => {
    assert.equal(wordmark.stroke.width, logo.bowl.strokeWidth);
    const [startX, startY] = numbers(wordmark.stroke.d);
    assert.equal(startY, logo.guides.bowl.cy, 'the tooth of ي is as tall as the bowl');
    assert.ok(wordmark.stroke.d.includes(` ${baseline}`), 'the letters run on the bowl’s lowest line');
    assert.equal(startX, 72);
  });

  it('draws the dots of ي exactly like the mark’s, centred under its tooth', () => {
    const [a, b] = wordmark.dots;
    const [markA, markB] = logo.dots.items;
    assert.equal(a.r, markA.r);
    assert.equal(a.cy, markA.cy, 'same height as the mark’s dots');
    assert.equal(b.cx - a.cx, markB.cx - markA.cx, 'same spacing');
    assert.equal((a.cx + b.cx) / 2, 72);
  });

  it('writes the ḍamma with the logo’s golden drop, smaller, above the ي', () => {
    assert.equal(wordmark.damma.d, logo.drop.d);
    assert.match(wordmark.damma.transform, /rotate\(-145\) scale\(0\.78\)/);
    const [tx = NaN, ty = NaN] = numbers(wordmark.damma.transform);
    assert.ok(ty < logo.guides.bowl.cy - logo.bowl.strokeWidth / 2, 'the ḍamma floats above the tooth');
    assert.ok(Math.abs(tx - 72) < 8, 'and stays over it');
  });

  it('keeps every part inside its bounds and adapts to its options', () => {
    const { x, y, width, height } = wordmark.bounds;
    assert.ok(x < 20 && x + width > 72 && y < 20 && y + height > 60 && height < 64);
    const taller = arabicWordmark(logo, { sinHeight: 18 });
    assert.notEqual(taller.stroke.d, wordmark.stroke.d);
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
    const lettered = logoLockupSvg('ar', defaultTheme, { ...brand, wordmark: 'lettered' });
    assert.ok(!lettered.includes('<text'), 'the lettered name needs no font');
    assert.ok(lettered.includes(wordmark.stroke.d) && lettered.includes(`translate(${layout.markX} 0)`));
  });

  it('sets the name in the logo face by default, whatever the headings use', () => {
    assert.equal(brand.wordmark, 'typeset');
    const ar = logoLockupSvg('ar');
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

  it('softens every corner: the teeth of س are joined by smooth bowls', () => {
    const { guides } = wordmark;
    const gap = guides.sin[0] - guides.sin[1];
    assert.equal(guides.fillet, gap / 2, 'no straight run, and no sharp inside corner, between the teeth');
    assert.ok(guides.fillet - wordmark.stroke.width / 2 > 2.5, 'the inside of each corner stays visibly round');
    assert.equal(guides.baseline, logo.guides.bowl.cy + logo.guides.bowl.ry);
    assert.equal(guides.top, logo.guides.bowl.cy);
    assert.equal(guides.dots, logo.dots.items[0].cy);
    assert.ok(guides.teeth > guides.top && guides.teeth < guides.baseline);
    assert.ok(guides.tail.x < guides.sin[2] && guides.tail.y > guides.baseline, 'ر ends below the line, on the left');
  });

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
    const typeset = logoBackgroundSvg();
    assert.ok(
      typeset.includes('>يُسر</text>') && typeset.includes('@import url("https://fonts.googleapis.com/css2?family=Reem+Kufi'),
      'the set name carries its face',
    );
    const svg = logoBackgroundSvg({}, defaultTheme, { ...brand, wordmark: 'lettered' });
    assert.match(svg, /^<svg [^>]*width="1920" height="1200" viewBox="0 0 1920 1200"/);
    assert.ok(!svg.includes('<text'), 'lettered, so it renders the same without fonts');
    assert.ok(svg.includes(wordmark.stroke.d) && svg.includes(brand.logo.bowl.d));
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

  it('holds a rosette of eight drops and a seed at each corner', () => {
    const geometry = andalusianPattern(144);
    assert.equal(geometry.rosette.match(/M/g)?.length, 8);
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
