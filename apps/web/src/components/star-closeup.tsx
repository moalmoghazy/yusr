'use client';

import { andalusianPattern } from '@yusr/theme';
import { Icon } from '@yusr/ui';
import { useState, type CSSProperties } from 'react';

const TILE = andalusianPattern(144);
const SIZE = TILE.tile;
const split = (d: string) =>
  d
    .split('M')
    .filter(Boolean)
    .map((part) => `M${part}`);
/** The rosette's seven drops as separate shapes, so each can come up in turn. */
const DROPS = split(TILE.rosette);
/**
 * The lattice's channels, in the order water runs through them: the eight-pointed star (two squares),
 * then the eight spokes from its points out to the tile's edges, then the small diamond at the corner
 * where four tiles meet (one per tile; its neighbours draw the other three).
 */
const LINES = split(TILE.lattice);
const STAR = LINES.slice(0, 2);
const SPOKES = LINES.slice(2, 10);
const CORNER = LINES[10]!;
const SEED = split(TILE.seeds)[0]!;

/** Tiles around the centre one, far enough to reach every edge of a wide or tall frame. */
const RING = 2;
const TILES = Array.from({ length: (2 * RING + 1) ** 2 }, (_, index) => {
  const x = (index % (2 * RING + 1)) - RING;
  const y = Math.floor(index / (2 * RING + 1)) - RING;
  return { x, y, ring: Math.max(Math.abs(x), Math.abs(y)) };
}).sort((a, b) => a.ring - b.ring);

/** When water reaches a tile: the centre first, then ring after ring (seconds). */
const reach = (ring: number) => 0.3 + ring * 1.15;
const at = (seconds: number) => ({ '--sc-at': `${seconds.toFixed(2)}s` }) as CSSProperties;

/**
 * One star of «روضة العطاء», enlarged among its neighbours. Water runs from the centre through the
 * green channels of the lattice: it fills the star, flows out along its spokes into the next stars, and
 * so on to the edges of the frame; each star's golden drops come up as the water reaches it — in the
 * centre one after another, from the top, clockwise: the seven ears of Al-Baqarah 261. Then the water
 * keeps flowing, a glint running along the channels. A click (or the button) plays it again. Still
 * under reduced motion.
 */
export function StarCloseup({ label, replayLabel }: { label: string; replayLabel: string }) {
  const [run, setRun] = useState(0);
  const replay = () => setRun((value) => value + 1);
  return (
    <>
      <svg key={run} onClick={replay} viewBox="-18 -18 180 180" preserveAspectRatio="xMidYMid slice" className="sc-svg" role="img" aria-label={label}>
        <defs>
          <radialGradient id="sc-glow">
            <stop offset="0" style={{ stopColor: 'var(--highlight)', stopOpacity: 0.32 }} />
            <stop offset="1" style={{ stopColor: 'var(--highlight)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        <rect x="-400" y="-400" width="944" height="944" className="sc-ground" />
        <circle cx="72" cy="72" r="40" fill="url(#sc-glow)" className="sc-glow" />
        {TILES.map(({ x, y, ring }) => {
          const start = reach(ring);
          const centre = ring === 0;
          return (
            <g key={`${x}:${y}`} transform={`translate(${x * SIZE} ${y * SIZE})`}>
              {/* The empty channel bed, then the water that fills it, then the glint that keeps running. */}
              {[...STAR, ...SPOKES, CORNER].map((d, index) => (
                <path key={`bed${index}`} d={d} className="sc-bed" />
              ))}
              {STAR.map((d) => (
                <path key={d} d={d} pathLength={1} className="sc-water" style={at(start)} />
              ))}
              {SPOKES.map((d) => (
                <path key={d} d={d} pathLength={1} className="sc-water sc-water-spoke" style={at(start + 0.5)} />
              ))}
              <path d={CORNER} pathLength={1} className="sc-water sc-water-corner" style={at(start + 0.95)} />
              {[...STAR, ...SPOKES].map((d) => (
                <path key={`flow${d}`} d={d} pathLength={1} className="sc-flow" style={at(reach(RING) + 1.4 + ring * 0.35)} />
              ))}
              <path d={SEED} className="sc-seed" style={at(start + 1.05)} />
              {DROPS.map((d, index) => (
                <path key={d} d={d} className="sc-drop" style={at(centre ? 0.4 + index * 0.22 : start + 0.45 + index * 0.07)} />
              ))}
            </g>
          );
        })}
      </svg>
      <button
        type="button"
        onClick={replay}
        className="absolute inset-x-0 bottom-5 mx-auto inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:hidden"
      >
        <Icon name="refresh" size={16} />
        {replayLabel}
      </button>
    </>
  );
}
