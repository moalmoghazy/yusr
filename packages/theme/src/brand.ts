/**
 * Brand identity. Swap names, tagline and the logo geometry here; every surface
 * (web, admin, mobile, emails, receipts) renders the mark from these paths.
 *
 * Concept — the open bowl of ي, which is also a pair of cupped hands. Since 2026-11-08 the mark is the
 * bowl alone, lit from within: a band of bright turquoise and a band of the ḍamma's gold follow the
 * inside of the curve and fade away up its right arm («الضمّة» now lives in the light rather than above
 * the bowl; the wordmark «يُسر» keeps its golden ḍamma). Earlier versions — a golden drop above the bowl,
 * with the two dots of ي beneath it — are kept in LOGO_VARIANTS.
 */
export interface LogoDot {
  cx: number;
  cy: number;
  r: number;
}

export interface LogoDots {
  /**
   * `solid`: two filled dots under the curve, in the curve's colour (the written ي).
   * `cutout`: two hollow circles punched out of the curve's stroke (rendered with a mask).
   */
  style: 'solid' | 'cutout';
  items: readonly [LogoDot, LogoDot];
}

/**
 * One band of light inside the bowl: an ellipse filled with an elliptical (radial) gradient, so its
 * outer edge is crisp and it fades towards the middle. The band's outline runs from `top` straight
 * down the ellipse's sides and round its lower half.
 */
export interface LogoShineBand {
  /** `shine`: the bright turquoise; `gold`: the ḍamma's gold. */
  tone: 'shine' | 'gold';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Gradient stops from the centre (0) to the ellipse (1): [offset, opacity]. */
  stops: readonly (readonly [number, number])[];
}

export interface LogoShine {
  /** Drawn in order (later bands on top), and only where the bowl's stroke is. */
  bands: readonly LogoShineBand[];
  /** Where the bands begin at the top of the arms. */
  top: number;
  /** The light fades along this line: fully lit at (x1, y1), gone at (x2, y2) — up the right arm. */
  fade: { x1: number; y1: number; x2: number; y2: number };
}

export interface LogoGeometry {
  viewBox: string;
  /** The open bowl / cupped hands. Rendered as a stroke. */
  bowl: { d: string; strokeWidth: number };
  /** The light inside the bowl (current mark); null for the earlier, flat versions. */
  shine: LogoShine | null;
  /** The two dots of ي; null when the mark has none. */
  dots: LogoDots | null;
  /**
   * Below this size (px) the dots are simplified so the mark stays crisp: solid dots join
   * into one short stroke, the way two dots are written by hand in Ruqʿa; cut-out dots are left out.
   */
  dotsMinSize: number;
  /** The golden ḍamma above the bowl. Rendered as a filled shape; null when the mark has none. */
  drop: { d: string; transform: string } | null;
  /** Construction guides: the half-ellipse the bowl follows and (with a drop) the circle of the drop's round end. */
  guides: {
    bowl: { cx: number; cy: number; rx: number; ry: number };
    drop: { cx: number; cy: number; r: number } | null;
  };
  /** Visual bounds of the whole mark in viewBox units; icons centre the mark on these. */
  bounds: { x: number; y: number; width: number; height: number };
}

const r2 = (value: number) => Math.round(value * 100) / 100;

/** A shine band's outline: down from `top` on both sides of its ellipse and round the lower half. */
export function shineBandPath(band: LogoShineBand, top: number): string {
  const left = r2(band.cx - band.rx);
  const right = r2(band.cx + band.rx);
  return `M${left} ${top}L${left} ${band.cy}A${band.rx} ${band.ry} 0 0 0 ${right} ${band.cy}L${right} ${top}Z`;
}

/** The colours of the light inside the bowl, for a bowl drawn in `bowl` (see brand.ts LogoShine). */
export interface ShineColors {
  shine: string;
  gold: string;
}

/**
 * A ḍamma as it is written: a round head with a short tail leaving from the bottom of the head.
 * At `angle` 0 the tail runs straight out to the left, level with the head's bottom; a negative angle turns it anticlockwise, so -45 sends the tail down and to
 * the left. Returned as one filled path (head and tail drawn in the same direction, so they join).
 */
export function dammaPath(cx: number, cy: number, r: number, options: { angle?: number; tail?: number; tailWidth?: number } = {}): string {
  const { angle = 0, tail = 2 * r, tailWidth = 0.7 * r } = options;
  const turn = (angle * Math.PI) / 180;
  const at = (x: number, y: number): [number, number] => [cx + x * Math.cos(turn) - y * Math.sin(turn), cy + x * Math.sin(turn) + y * Math.cos(turn)];
  const p = ([x, y]: [number, number]) => `${r2(x)} ${r2(y)}`;
  const h = tailWidth / 2;
  const level = r - h; // the tail's centre line, so its lower edge meets the bottom of the head
  // Head: a circle, clockwise on screen.
  const head = `M${p(at(r, 0))}A${r2(r)} ${r2(r)} 0 1 1 ${p(at(-r, 0))}A${r2(r)} ${r2(r)} 0 1 1 ${p(at(r, 0))}Z`;
  // Tail: a capsule from under the head's centre out to the left, also clockwise.
  const tailPath = [
    `M${p(at(0, level - h))}`,
    `L${p(at(0, level + h))}`,
    `L${p(at(-tail, level + h))}`,
    `A${r2(h)} ${r2(h)} 0 0 1 ${p(at(-tail, level - h))}`,
    'Z',
  ].join('');
  return head + tailPath;
}

/** The earlier marks' ḍamma: the golden drop, its point turned towards the upper left, floating over the bowl's mouth. */
const DROP_PATH = 'M32 8.5c0 0-7.6 9.1-7.6 14.1a7.6 7.6 0 0 0 15.2 0c0-5-7.6-14.1-7.6-14.1Z';

/** The golden ḍamma drop of the earlier marks (kept for the older logo variants). */
export const DAMMA_DROP = { d: DROP_PATH, transform: 'translate(3 -5.5) rotate(-145 32 21.5)' } as const;

/**
 * The explored versions of the mark, kept side by side so the identity can be switched
 * in one line (brand.logo below). All sit on the same 64-unit grid.
 */
export const LOGO_VARIANTS = {
  /**
   * Current (approved 2026-11-08 from the owner's design, yusr-mark-color.psd): the bowl alone, lit from
   * within by a turquoise band near its outer edge and a gold band inside it, both fading up the right arm.
   */
  lit: {
    viewBox: '0 0 64 64',
    bowl: { d: 'M12.5 24c0 12.4 8.7 21 19.5 21s19.5-8.6 19.5-21', strokeWidth: 7.6 },
    shine: {
      bands: [
        {
          tone: 'shine',
          cx: 32,
          cy: 25.9,
          rx: 21.03,
          ry: 21.95,
          stops: [
            [0.705, 0],
            [0.976, 1],
          ],
        },
        {
          tone: 'gold',
          cx: 32,
          cy: 25.51,
          rx: 18.94,
          ry: 19.81,
          stops: [
            [0.77, 0],
            [0.77, 0.28],
            [0.935, 1],
          ],
        },
      ],
      top: 22.5,
      fade: { x1: 28.25, y1: 44.48, x2: 33.38, y2: 35.75 },
    },
    dots: null,
    dotsMinSize: 0,
    drop: null,
    guides: { bowl: { cx: 32, cy: 24, rx: 19.5, ry: 21 }, drop: null },
    bounds: { x: 8.7, y: 20.2, width: 46.6, height: 28.6 },
  },
  /** Before 2026-11-08: solid dots under the curve, close together, in the curve's colour, and the golden drop above. */
  dotsBelow: {
    viewBox: '0 0 64 64',
    bowl: { d: 'M12.5 24c0 12.4 8.7 21 19.5 21s19.5-8.6 19.5-21', strokeWidth: 7.6 },
    shine: null,
    // 2.6 units under the stroke, 1.6 units apart, centred under the lowest point.
    dots: {
      style: 'solid',
      items: [
        { cx: 28, cy: 54.6, r: 3.2 },
        { cx: 36, cy: 54.6, r: 3.2 },
      ],
    },
    dotsMinSize: 20,
    drop: DAMMA_DROP,
    guides: { bowl: { cx: 32, cy: 24, rx: 19.5, ry: 21 }, drop: { cx: 35.63, cy: 15.1, r: 7.6 } },
    bounds: { x: 8.7, y: 7.5, width: 46.6, height: 50.3 },
  },
  /** Previous: hollow dots cut into the curve itself, on its centre line. */
  dotsInCurve: {
    viewBox: '0 0 64 64',
    bowl: { d: 'M12.5 30.5c0 12.4 8.7 21 19.5 21s19.5-8.6 19.5-21', strokeWidth: 7.6 },
    shine: null,
    dots: {
      style: 'cutout',
      items: [
        { cx: 26.4, cy: 50.66, r: 2.35 },
        { cx: 37.6, cy: 50.66, r: 2.35 },
      ],
    },
    dotsMinSize: 20,
    drop: { d: DROP_PATH, transform: 'translate(3 1) rotate(-145 32 21.5)' },
    guides: { bowl: { cx: 32, cy: 30.5, rx: 19.5, ry: 21 }, drop: { cx: 35.63, cy: 21.6, r: 7.6 } },
    bounds: { x: 8.7, y: 14, width: 46.6, height: 41.3 },
  },
} as const satisfies Record<string, LogoGeometry>;

export type LogoVariant = keyof typeof LOGO_VARIANTS;

export interface BrandConfig {
  name: { ar: string; en: string };
  tagline: { ar: string; en: string };
  descriptor: { ar: string; en: string };
  logo: LogoGeometry;
  /**
   * How the Arabic name is written beside the mark: `typeset` sets «يُسر» in the logo face
   * (Reem Kufi, `typography.fonts.logo`); `lettered` draws the approved lettering (wordmark.ts).
   */
  wordmark: 'typeset' | 'lettered';
  /** Placeholders — set real values through environment config before launch. */
  contact: { email: string; phone: string; website: string };
  /** The app's pages in each store; null until it is published there (the badge then says «soon»). */
  apps: { appStore: string | null; googlePlay: string | null; appGallery: string | null };
  legal: { entity: { ar: string; en: string }; registration: string };
}

export const brand: BrandConfig = {
  name: { ar: 'يُسر', en: 'Yusr' },
  tagline: { ar: 'فإنّ مع العسر يسرًا', en: 'With hardship comes ease' },
  descriptor: { ar: 'منصة عطاء موثوقة وشفافة', en: 'Trusted, transparent giving' },
  logo: LOGO_VARIANTS.lit,
  wordmark: 'lettered',
  contact: { email: 'care@yusr.example', phone: '+20 100 000 0000', website: 'https://yusr.example' },
  apps: { appStore: null, googlePlay: null, appGallery: null },
  legal: {
    entity: { ar: 'مؤسسة يُسر للتنمية المجتمعية', en: 'Yusr Community Development Foundation' },
    registration: 'Registration no. — pending',
  },
};
