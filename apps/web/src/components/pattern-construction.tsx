import { andalusianPattern } from '@yusr/theme';

const TILE = andalusianPattern(144);

/**
 * One tile of «روضة العطاء» at full strength among its faded neighbours, with its four parts
 * numbered to match the list beside it: the star, the strapwork, the rosette and the seed.
 */
export function PatternConstruction({ label, number }: { label: string; number: (value: number) => string }) {
  const T = TILE.tile;
  const c = T / 2;
  const star = 0.3 * T;
  const markers = [
    { n: 1, x: 172, y: 28, to: [c + star * 0.5, c - star * 0.5] },
    { n: 2, x: 172, y: c, to: [T - 10, c] },
    { n: 3, x: 172, y: 112, to: [c + 20, c + 20] },
    { n: 4, x: 172, y: 164, to: [T + 7, T + 7] },
  ] as const;
  return (
    <svg viewBox="-36 -36 222 216" className="pc-svg" role="img" aria-label={label}>
      <defs>
        <pattern id="pc-tile" width={T} height={T} patternUnits="userSpaceOnUse">
          <path d={TILE.lattice} className="pc-lines" />
          <path d={TILE.rosette + TILE.seeds} className="pc-drops" />
        </pattern>
        <clipPath id="pc-clip">
          <rect x="-36" y="-36" width="216" height="216" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#pc-clip)">
        <rect x="-36" y="-36" width="216" height="216" className="pc-ground" />
        <rect x="-36" y="-36" width="216" height="216" fill="url(#pc-tile)" className="pc-neighbours" />
      </g>
      <rect x="0" y="0" width={T} height={T} className="pc-tile" />
      <circle cx={c} cy={c} r={star} className="pc-guide" />
      <path d={TILE.lattice} className="pc-lattice" />
      <path d={TILE.rosette} className="pc-rosette" />
      <path d={TILE.seeds} className="pc-rosette" />
      {markers.map((marker) => (
        <g key={marker.n} className="pc-marker">
          <line x1={marker.x - 7} y1={marker.y} x2={marker.to[0]} y2={marker.to[1]} />
          <circle cx={marker.x} cy={marker.y} r={7} />
          <text x={marker.x} y={marker.y + 3} textAnchor="middle">
            {number(marker.n)}
          </text>
        </g>
      ))}
    </svg>
  );
}
