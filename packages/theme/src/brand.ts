/**
 * Brand identity. Swap names, tagline and the logo geometry here; every surface
 * (web, admin, mobile, emails, receipts) renders the mark from these paths.
 *
 * Concept — "الضمّة الذهبية" (the golden ḍamma): the ḍamma is the small mark that
 * turns يسر into يُسر ("ease"). The logo shows it as a golden drop held above an open,
 * cupped curve — the bowl of the letter ي with its two dots beneath it, in the same
 * colour — and at the same time a pair of open hands. A small gift, held carefully,
 * that changes the meaning of someone's day.
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

export interface LogoGeometry {
  viewBox: string;
  /** The open bowl / cupped hands. Rendered as a stroke. */
  bowl: { d: string; strokeWidth: number };
  /** The two dots of ي. */
  dots: LogoDots;
  /**
   * Below this size (px) the dots are simplified so the mark stays crisp: solid dots join
   * into one short stroke, the way two dots are written by hand in Ruqʿa; cut-out dots are left out.
   */
  dotsMinSize: number;
  /** The golden ḍamma. Rendered as a filled shape. */
  drop: { d: string; transform: string };
  /** Construction guides: the half-ellipse the bowl follows and the circle of the drop's round end. */
  guides: {
    bowl: { cx: number; cy: number; rx: number; ry: number };
    drop: { cx: number; cy: number; r: number };
  };
  /** Visual bounds of the whole mark in viewBox units; icons centre the mark on these. */
  bounds: { x: number; y: number; width: number; height: number };
}

const r2 = (value: number) => Math.round(value * 100) / 100;

/**
 * A ḍamma as it is written: a round head with a short tail leaving from the bottom of the head.
 * At `angle` 0 the tail runs straight out to the left, level with the head's bottom (as above
 * the lettered «يُسر»); a negative angle turns it anticlockwise, so -45 sends the tail down and to
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

/** The mark's ḍamma: the golden drop, its point turned towards the upper left, floating over the bowl's mouth. */
const DROP_PATH = 'M32 8.5c0 0-7.6 9.1-7.6 14.1a7.6 7.6 0 0 0 15.2 0c0-5-7.6-14.1-7.6-14.1Z';

/**
 * The explored versions of the mark, kept side by side so the identity can be switched
 * in one line (brand.logo below). Both sit on the same 64-unit grid.
 */
export const LOGO_VARIANTS = {
  /** Current: solid dots under the curve, close together, in the curve's colour. */
  dotsBelow: {
    viewBox: '0 0 64 64',
    bowl: { d: 'M12.5 24c0 12.4 8.7 21 19.5 21s19.5-8.6 19.5-21', strokeWidth: 7.6 },
    // 2.6 units under the stroke, 1.6 units apart, centred under the lowest point.
    dots: {
      style: 'solid',
      items: [
        { cx: 28, cy: 54.6, r: 3.2 },
        { cx: 36, cy: 54.6, r: 3.2 },
      ],
    },
    dotsMinSize: 20,
    drop: { d: DROP_PATH, transform: 'translate(3 -5.5) rotate(-145 32 21.5)' },
    guides: { bowl: { cx: 32, cy: 24, rx: 19.5, ry: 21 }, drop: { cx: 35.63, cy: 15.1, r: 7.6 } },
    bounds: { x: 8.7, y: 7.5, width: 46.6, height: 50.3 },
  },
  /** Previous: hollow dots cut into the curve itself, on its centre line. */
  dotsInCurve: {
    viewBox: '0 0 64 64',
    bowl: { d: 'M12.5 30.5c0 12.4 8.7 21 19.5 21s19.5-8.6 19.5-21', strokeWidth: 7.6 },
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
   * (Reem Kufi, `typography.fonts.logo`); `lettered` draws it with the mark's own pen (wordmark.ts).
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
  logo: LOGO_VARIANTS.dotsBelow,
  wordmark: 'lettered',
  contact: { email: 'care@yusr.example', phone: '+20 100 000 0000', website: 'https://yusr.example' },
  apps: { appStore: null, googlePlay: null, appGallery: null },
  legal: {
    entity: { ar: 'مؤسسة يُسر للتنمية المجتمعية', en: 'Yusr Community Development Foundation' },
    registration: 'Registration no. — pending',
  },
};
