/**
 * The Arabic wordmark «يُسر», lettered in the mark's own language instead of set in a font:
 *
 *   - one monoline stroke with round caps, at the bowl's stroke weight, so the word and the
 *     mark read as one drawing;
 *   - soft corners: every tooth meets the baseline through a curve (the teeth of س are joined
 *     by smooth bowls), so no corner is sharp, inside or out;
 *   - the two dots of ي drawn exactly like the mark's (same size, same height);
 *   - the ḍamma as the logo's golden drop, smaller, held above the ي.
 *
 * Everything is computed from a few numbers on the logo's 64-unit grid (baseline on the
 * bowl's lowest point, the tooth of ي as tall as the bowl), so the word lines up with the mark
 * in a lockup: tooth tops, baseline, dots and drops share the same heights.
 */
import { brand, type LogoDot, type LogoGeometry } from './brand';

export interface WordmarkGeometry {
  /** The letters: one continuous stroke (round caps and joins). */
  stroke: { d: string; width: number };
  /** The two dots under ي, in the stroke's colour. */
  dots: readonly [LogoDot, LogoDot];
  /** The golden ḍamma above ي: the logo's drop path with its own transform. */
  damma: { d: string; transform: string };
  /** Visual bounds (stroke and drop included), in logo units. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Construction lines and anchors, in logo units (for construction drawings and checks). */
  guides: {
    /** Top of the ي tooth: the height of the bowl's ends. */
    top: number;
    /** Top of the teeth of س. */
    teeth: number;
    /** The line the word sits on: the bowl's lowest point. */
    baseline: number;
    /** Centre line of the dots, shared with the mark. */
    dots: number;
    /** x of the ي tooth and of the three teeth of س. */
    ya: number;
    sin: readonly [number, number, number];
    /** Where the tail of ر ends. */
    tail: { x: number; y: number };
    /** Radius of the corners where teeth meet the line (centre line). */
    fillet: number;
  };
}

export interface WordmarkOptions {
  /** x of the ي tooth (the word's right edge, since Arabic starts there). */
  right?: number;
  /** Tooth heights above the baseline, centre line to centre line. */
  yaHeight?: number;
  sinHeight?: number;
  /** Centre-to-centre gaps: ي → first tooth of س, and between the teeth of س. */
  gapYaSin?: number;
  gapSin?: number;
  /**
   * Radius of the corners where teeth meet the baseline. By default half the gap between the
   * teeth of س, so they are joined by smooth bowls and no corner is sharp, inside or out.
   */
  fillet?: number;
  /** Baseline run from the last tooth of س to the start of ر. */
  raJoin?: number;
  /** How far the tail of ر reaches left and below the baseline. */
  raWidth?: number;
  raDepth?: number;
  /** 0 ends the tail straight down; towards 1 it leaves pointing further left. */
  raTilt?: number;
  /** Size of the ḍamma relative to the mark's drop. */
  dammaScale?: number;
}

const round = (value: number) => Math.round(value * 100) / 100;
const pt = (x: number, y: number) => `${round(x)} ${round(y)}`;

/** Where the mark's drop path has the centre of its round end, before any transform. */
const DROP_ROUND_END = { x: 32, y: 22.6, r: 7.6 };
/** The mark's drop is turned so its tip points down-left, the way a ḍamma's tail does. */
const DROP_TURN = -145;

export function arabicWordmark(logo: LogoGeometry = brand.logo, options: WordmarkOptions = {}): WordmarkGeometry {
  const width = logo.bowl.strokeWidth;
  const half = width / 2;
  // The baseline sits on the bowl's lowest point; the ي tooth reaches the bowl's top.
  const baseline = logo.guides.bowl.cy + logo.guides.bowl.ry;
  const {
    right = 72,
    yaHeight = baseline - logo.guides.bowl.cy,
    sinHeight = 15,
    gapYaSin = 18,
    gapSin = 13.5,
    fillet = gapSin / 2,
    raJoin = 10,
    raWidth = 15,
    raDepth = 14.5,
    raTilt = 0.6,
    dammaScale = 0.78,
  } = options;

  const ya = right;
  const teeth = [ya - gapYaSin, ya - gapYaSin - gapSin, ya - gapYaSin - 2 * gapSin];
  const raStart = teeth[2]! - raJoin;
  const r = fillet;

  const parts: string[] = [];
  // ي: down the tooth, round the corner into the baseline.
  parts.push(`M${pt(ya, baseline - yaHeight)}`, `L${pt(ya, baseline - r)}`, `Q${pt(ya, baseline)} ${pt(ya - r, baseline)}`);
  // س: three short teeth, each rising from the baseline through fillets on both sides.
  for (const x of teeth) {
    parts.push(
      `L${pt(x + r, baseline)}`,
      `Q${pt(x, baseline)} ${pt(x, baseline - r)}`,
      `L${pt(x, baseline - sinHeight)}`,
      `L${pt(x, baseline - r)}`,
      `Q${pt(x, baseline)} ${pt(x - r, baseline)}`,
    );
  }
  // ر: the baseline runs on, then the tail sweeps down and to the left.
  parts.push(
    `L${pt(raStart, baseline)}`,
    `C${pt(raStart - raWidth * 0.5, baseline)} ${pt(raStart - raWidth * (0.92 - 0.4 * raTilt), baseline + raDepth * (0.3 + 0.25 * raTilt))} ${pt(raStart - raWidth, baseline + raDepth)}`,
  );

  // The dots: the mark's own dots, centred under the ي tooth at the mark's height.
  const [markDot] = logo.dots.items;
  const spread = Math.abs(logo.dots.items[1].cx - markDot.cx) / 2;
  const dots = [
    { cx: round(ya - spread), cy: markDot.cy, r: markDot.r },
    { cx: round(ya + spread), cy: markDot.cy, r: markDot.r },
  ] as const;

  // The ḍamma: the mark's drop, smaller, its round end above and just right of the tooth.
  const dammaR = DROP_ROUND_END.r * dammaScale;
  const dammaX = ya + dammaR * 0.55;
  const dammaY = baseline - yaHeight - half - dammaR - 3.4;
  const damma = {
    d: logo.drop.d,
    transform: `translate(${pt(dammaX, dammaY)}) rotate(${DROP_TURN}) scale(${round(dammaScale)}) translate(${pt(-DROP_ROUND_END.x, -DROP_ROUND_END.y)})`,
  };

  // Bounds: stroke extremes and the ḍamma's extent. Its tip starts straight above the round end
  // (8.5 in the drop path) and turns with the drop.
  const turn = (DROP_TURN * Math.PI) / 180;
  const tipLength = (DROP_ROUND_END.y - 8.5) * dammaScale;
  const tipX = dammaX + tipLength * Math.sin(turn);
  const tipY = dammaY - tipLength * Math.cos(turn);
  const minX = Math.min(raStart - raWidth - half, tipX);
  const maxX = Math.max(ya + spread + markDot.r, dammaX + dammaR, ya + half);
  const minY = Math.min(dammaY - dammaR, baseline - yaHeight - half, tipY);
  const maxY = Math.max(baseline + raDepth + half, markDot.cy + markDot.r);
  return {
    stroke: { d: parts.join(''), width },
    dots,
    damma,
    bounds: { x: round(minX), y: round(minY), width: round(maxX - minX), height: round(maxY - minY) },
    guides: {
      top: round(baseline - yaHeight),
      teeth: round(baseline - sinHeight),
      baseline: round(baseline),
      dots: markDot.cy,
      ya: round(ya),
      sin: [round(teeth[0]!), round(teeth[1]!), round(teeth[2]!)],
      tail: { x: round(raStart - raWidth), y: round(baseline + raDepth) },
      fillet: round(r),
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
