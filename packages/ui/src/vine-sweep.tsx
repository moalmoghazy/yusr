import type { CSSProperties } from 'react';
import { cn } from './cn';

/**
 * «الغصن المتعرّش»: Yusr's decorative motif (chosen 2026-11-16, replacing the sweep of the logo's ر).
 * A climbing branch in the manner of Arabic leaf-scroll ornament: a wavy stem, two curling tendrils with
 * a berry at each tip, and almond leaves. The stem, tendrils and leaves take `currentColor`; the berries
 * take the logo's accent (`--logo-accent`).
 *
 * Geometry on a 240 × 120 grid. Each leaf keeps the point where it meets the stem, so it can grow from there.
 */
export const VINE = {
  viewBox: '0 0 240 120',
  stem: 'M6 96C48 34 90 130 130 72S198 18 234 46',
  tendrils: ['M54 66c-9-22 15-35 25-22 5 9-5 16-10 9', 'M150 56c3-24 32-28 36-12 2 10-10 13-13 6'],
  leaves: [
    { d: 'M22 80q-9-27 11-42 11 25-11 42z', at: [22, 80] },
    { d: 'M88 90q12-29 43-29-10 29-43 29z', at: [88, 90] },
    { d: 'M106 101q20 13 39 0-18-17-39 0z', at: [106, 101] },
    { d: 'M176 44q-5-26 15-38 9 25-15 38z', at: [176, 44] },
    { d: 'M212 42q2-28 26-36 4 28-26 36z', at: [212, 42] },
  ],
  berries: [
    [69, 53],
    [173, 50],
  ],
} as const;

/** The small sprig under section titles, on a 96 × 16 grid. */
export const VINE_SPRIG = {
  viewBox: '0 0 96 16',
  stem: 'M2 11C22 3 42 16 62 9S84 4 90 6',
  leaves: [
    { d: 'M28 9q6-9 15-7-5 9-15 7z', at: [28, 9] },
    { d: 'M66 8q4-8 13-8-3 9-13 8z', at: [66, 8] },
  ],
  berries: [[92, 6]],
} as const;

/*
 * The growth: the stem draws itself, then the tendrils curl out, the leaves unfold from the stem one after
 * another, and the berries ripen last. Without motion (or before the styles load) it simply shows, whole.
 * Kept inside the component so the website and the control hub share it without stylesheet changes.
 */
const STYLE = `
@media (prefers-reduced-motion: no-preference) {
  .yv-grow .yv-stem, .yv-grow .yv-tendril { stroke-dasharray: 1; stroke-dashoffset: 1; animation: yv-draw var(--yv-ms) cubic-bezier(.45,.05,.3,1) var(--yv-at) forwards; }
  .yv-grow .yv-tendril { animation-delay: calc(var(--yv-at) + var(--yv-ms) * .55); animation-duration: calc(var(--yv-ms) * .6); }
  .yv-grow .yv-leaf { transform: scale(0); opacity: 0; transform-box: view-box; animation: yv-leaf calc(var(--yv-ms) * .45) cubic-bezier(.3,1.4,.5,1) calc(var(--yv-at) + var(--yv-ms) * (.25 + var(--yv-i) * .16)) forwards; }
  .yv-grow .yv-berry { transform: scale(0); transform-box: fill-box; transform-origin: center; animation: yv-leaf .5s cubic-bezier(.3,1.6,.5,1) calc(var(--yv-at) + var(--yv-ms) * 1.15 + var(--yv-i) * 160ms) forwards; }
}
@keyframes yv-draw { to { stroke-dashoffset: 0; } }
@keyframes yv-leaf { to { transform: scale(1); opacity: 1; } }
`;

export interface VineSweepProps {
  className?: string;
  /** Grow it in on load (stem, tendrils, leaves, berries); otherwise it is simply there. */
  growing?: boolean;
  delayMs?: number;
  durationMs?: number;
  /** Mirror it, so it climbs the other way. */
  flip?: boolean;
  /** The small sprig for under section titles, instead of the full branch. */
  sprig?: boolean;
  /** Stretch to fill its box (a whole band's background); the stem and tendrils keep their width in px. */
  fill?: boolean;
}

export function VineSweep({ className, growing = false, delayMs = 0, durationMs = 2200, flip = false, sprig = false, fill = false }: VineSweepProps) {
  const shape = sprig ? VINE_SPRIG : VINE;
  const [, , width] = shape.viewBox.split(' ').map(Number) as [number, number, number, number];
  const timing = { '--yv-at': `${delayMs}ms`, '--yv-ms': `${durationMs}ms` } as CSSProperties;
  const stroke = fill ? 7 : sprig ? 2 : 3.2;
  const tendril = fill ? 4.5 : 2.2;
  const vectorEffect = fill ? 'non-scaling-stroke' : undefined;
  return (
    <svg
      viewBox={shape.viewBox}
      preserveAspectRatio={sprig || fill ? 'none' : 'xMidYMid meet'}
      aria-hidden
      focusable="false"
      className={cn('pointer-events-none overflow-visible', growing && 'yv-grow', className)}
      style={timing}
    >
      {growing && <style>{STYLE}</style>}
      <g transform={flip ? `translate(${width} 0) scale(-1 1)` : undefined}>
        <path
          className="yv-stem"
          d={shape.stem}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          vectorEffect={vectorEffect}
        />
        {'tendrils' in shape &&
          shape.tendrils.map((d) => (
            <path
              key={d}
              className="yv-tendril"
              d={d}
              pathLength={1}
              fill="none"
              stroke="currentColor"
              strokeWidth={tendril}
              strokeLinecap="round"
              vectorEffect={vectorEffect}
            />
          ))}
        {shape.leaves.map((leaf, index) => (
          <path
            key={leaf.d}
            className="yv-leaf"
            d={leaf.d}
            fill="currentColor"
            style={{ transformOrigin: `${leaf.at[0]}px ${leaf.at[1]}px`, ['--yv-i' as string]: index } as CSSProperties}
          />
        ))}
        {shape.berries.map(([cx, cy], index) => (
          <circle
            key={`${cx}-${cy}`}
            className="yv-berry"
            cx={cx}
            cy={cy}
            r={sprig ? 2.6 : 4.5}
            style={{ fill: 'var(--logo-accent, #F9A72B)', ['--yv-i' as string]: index } as CSSProperties}
          />
        ))}
      </g>
    </svg>
  );
}
