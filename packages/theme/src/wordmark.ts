/**
 * The Arabic wordmark «يُسر», lettered in a geometric Kufi instead of set in a font:
 *
 *   - one heavy monoline weight with round ends at the top of every stroke;
 *   - the ي and the three teeth of س stand at one height on a single thick baseline, meeting it
 *     in square inside corners; the ي turns into the baseline through one broad curve;
 *   - ر is a single upright that rises with the teeth and drops below the line;
 *   - two round dots under the ي, and above it the ḍamma as it is written — a round head with a
 *     level tail — in the brand gold.
 *
 * The proportions are those of the approved lettering (stroke 35, teeth 52 apart, x-height 95 on
 * its own grid); they are scaled onto the logo's 64-unit grid so the teeth reach the top of the
 * bowl and the baseline sits on the bowl's lowest edge, and the word lines up with the mark in a
 * lockup.
 */
import { brand, dammaPath, type LogoDot, type LogoGeometry } from './brand';

export interface WordmarkGeometry {
  /** The letters: straight strokes and one curve, drawn with round caps. */
  stroke: { d: string; width: number };
  /** The two dots under ي, in the stroke's colour. */
  dots: readonly [LogoDot, LogoDot];
  /** The golden ḍamma above ي: a round head with a level tail. */
  damma: { d: string; transform: string };
  /** Visual bounds (stroke, dots and ḍamma included), in logo units. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Construction lines and anchors, in logo units (for construction drawings and checks). */
  guides: {
    /** Top edge of the teeth (all letters share it): the top of the bowl's ends. */
    top: number;
    /** Centre line of the baseline stroke. */
    baseline: number;
    /** Lower edge of the baseline stroke: the bowl's lowest edge. */
    bottom: number;
    /** x of the ي, of the three teeth of س (right to left) and of ر. */
    ya: number;
    sin: readonly [number, number, number];
    ra: number;
    /** Where ر ends below the line (its lowest edge). */
    descender: number;
    /** Radius of the ي's turn into the baseline (centre line). */
    turn: number;
  };
}

export interface WordmarkOptions {
  /** x of the ي (the word's right edge, since Arabic starts there). */
  right?: number;
}

const round = (value: number) => Math.round(value * 100) / 100;
const pt = (x: number, y: number) => `${round(x)} ${round(y)}`;

/** The approved lettering, on its own grid (y down): every number below is measured from it. */
const SOURCE = {
  stroke: 35,
  top: 78, // top edge of the teeth
  bottom: 173, // lower edge of the baseline stroke
  descender: 221, // lowest edge of ر
  ya: 474,
  sin: [392.5, 340, 288],
  ra: 209,
  turn: 28.5, // centre-line radius of the ي's turn
  dots: { y: 204, r: 17, x: [436.5, 474] },
  damma: { x: 484, y: 42.5, r: 17.5 },
} as const;

export function arabicWordmark(logo: LogoGeometry = brand.logo, options: WordmarkOptions = {}): WordmarkGeometry {
  // Teeth tops on the top of the bowl's ends, baseline on the bowl's lowest edge.
  const half = logo.bowl.strokeWidth / 2;
  const top = logo.guides.bowl.cy - half;
  const bottom = logo.guides.bowl.cy + logo.guides.bowl.ry + half;
  const s = (bottom - top) / (SOURCE.bottom - SOURCE.top);
  const { right = 72 } = options;
  const x = (value: number) => right + (value - SOURCE.ya) * s;
  const y = (value: number) => top + (value - SOURCE.top) * s;

  const width = SOURCE.stroke * s;
  const w2 = width / 2;
  const capTop = top + w2; // centre of the round ends
  const baseline = bottom - w2;
  const turn = SOURCE.turn * s;
  const ya = x(SOURCE.ya);
  const sin = SOURCE.sin.map(x) as unknown as readonly [number, number, number];
  const ra = x(SOURCE.ra);
  const descender = y(SOURCE.descender);

  const parts = [
    // ي: down, round the broad turn, and on along the baseline to ر.
    `M${pt(ya, capTop)}L${pt(ya, baseline - turn)}A${round(turn)} ${round(turn)} 0 0 1 ${pt(ya - turn, baseline)}L${pt(ra, baseline)}`,
    // س: three teeth standing on the line.
    ...sin.map((tooth) => `M${pt(tooth, capTop)}L${pt(tooth, baseline)}`),
    // ر: one upright, from the teeth's height to below the line.
    `M${pt(ra, capTop)}L${pt(ra, descender - w2)}`,
  ];

  const dotR = SOURCE.dots.r * s;
  const dots = [
    { cx: round(x(SOURCE.dots.x[0])), cy: round(y(SOURCE.dots.y)), r: round(dotR) },
    { cx: round(x(SOURCE.dots.x[1])), cy: round(y(SOURCE.dots.y)), r: round(dotR) },
  ] as const;

  const dammaR = SOURCE.damma.r * s;
  const dammaX = x(SOURCE.damma.x);
  const dammaY = y(SOURCE.damma.y);
  const damma = { d: dammaPath(dammaX, dammaY, dammaR), transform: 'translate(0 0)' };

  const minX = ra - w2;
  const maxX = Math.max(ya + w2, dammaX + dammaR, dots[1].cx + dotR);
  const minY = dammaY - dammaR;
  const maxY = Math.max(descender, dots[0].cy + dotR);
  return {
    stroke: { d: parts.join(''), width: round(width) },
    dots,
    damma,
    bounds: { x: round(minX), y: round(minY), width: round(maxX - minX), height: round(maxY - minY) },
    guides: {
      top: round(top),
      baseline: round(baseline),
      bottom: round(bottom),
      ya: round(ya),
      sin: [round(sin[0]), round(sin[1]), round(sin[2])],
      ra: round(ra),
      descender: round(descender),
      turn: round(turn),
    },
  };
}

export const wordmark = arabicWordmark();

/** Mark + Arabic wordmark on one grid: the word on the left, the mark on the right (Arabic reads from the right). */
export interface LockupLayout {
  /** viewBox of the whole lockup, in logo units (the mark's 64-unit grid). */
  viewBox: string;
  width: number;
  height: number;
  /** The mark is drawn at translate(markX 0). */
  markX: number;
}

export function arabicLockup(logo: LogoGeometry = brand.logo, word: WordmarkGeometry = wordmark, gap = 9): LockupLayout {
  const markX = word.bounds.x + word.bounds.width + gap - logo.bounds.x;
  const left = word.bounds.x;
  const right = markX + logo.bounds.x + logo.bounds.width;
  const top = Math.min(word.bounds.y, logo.bounds.y);
  const bottom = Math.max(word.bounds.y + word.bounds.height, logo.bounds.y + logo.bounds.height);
  return {
    viewBox: `${round(left)} ${round(top)} ${round(right - left)} ${round(bottom - top)}`,
    width: round(right - left),
    height: round(bottom - top),
    markX: round(markX),
  };
}

export const lockup = arabicLockup();
