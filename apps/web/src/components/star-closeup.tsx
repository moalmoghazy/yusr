import { andalusianPattern } from '@yusr/theme';
import type { CSSProperties } from 'react';

const TILE = andalusianPattern(144);
/** The rosette's seven drops as separate shapes, so each can come up in turn. */
const DROPS = TILE.rosette
  .split('M')
  .filter(Boolean)
  .map((d) => `M${d}`);

/**
 * One star of «روضة العطاء», enlarged among its faded neighbours. Its seven golden drops come up one
 * after another, from the top, clockwise — the seven ears of Al-Baqarah 261. Still under reduced motion.
 */
export function StarCloseup({ label }: { label: string }) {
  return (
    <svg viewBox="-18 -18 180 180" preserveAspectRatio="xMidYMid slice" className="sc-svg" role="img" aria-label={label}>
      <defs>
        <pattern id="sc-tile" width={TILE.tile} height={TILE.tile} patternUnits="userSpaceOnUse">
          <path d={TILE.lattice} className="sc-lines" />
          <path d={TILE.rosette + TILE.seeds} className="sc-drops" />
        </pattern>
        <radialGradient id="sc-glow">
          <stop offset="0" style={{ stopColor: 'var(--highlight)', stopOpacity: 0.32 }} />
          <stop offset="1" style={{ stopColor: 'var(--highlight)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <rect x="-200" y="-200" width="544" height="544" className="sc-ground" />
      <rect x="-200" y="-200" width="544" height="544" fill="url(#sc-tile)" className="sc-neighbours" />
      <circle cx="72" cy="72" r="40" fill="url(#sc-glow)" className="sc-glow" />
      <path d={TILE.lattice} className="sc-lattice" />
      <path d={TILE.seeds} className="sc-drops" />
      {DROPS.map((d, index) => (
        <path key={d} d={d} className="sc-drop" style={{ '--sc-i': index } as CSSProperties} />
      ))}
    </svg>
  );
}
