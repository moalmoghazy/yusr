/**
 * The brand pattern — «روضة العطاء» (the garden of giving).
 *
 * Andalusian geometry: the eight-pointed star of the Alhambra's tilework (two squares,
 * the khatam), joined to its neighbours by strapwork (lacería) that draws octagonal
 * cells between the stars. In each star, a rosette of seven golden drops — the ḍamma of
 * the logo, repeated seven times for the seven ears of the verse: a single gift that
 * multiplies, "like a grain that sprouts seven ears". Where four tiles meet, a small lozenge holds one seed.
 *
 * Everything is computed from one number (the tile size), so the tile repeats seamlessly:
 * every strapwork line ends exactly on an edge midpoint or a corner shared with the next tile.
 */

import type { ColorScheme, Theme } from './tokens';

export interface PatternGeometry {
  /** Tile width and height, in px at 1× (the pattern repeats every `tile` px). */
  tile: number;
  /** Stroked: the star, the strapwork and the corner lozenges. */
  lattice: string;
  /** Filled: the seven drops of each rosette. */
  rosette: string;
  /** Filled: the seed at each corner lozenge. */
  seeds: string;
}

/** The rosette's seven drops, evenly spaced, the first pointing straight up (-90°): the seven ears of Al-Baqarah 261. */
const SEVEN = Array.from({ length: 7 }, (_, index) => -90 + (index * 360) / 7);
const round = (value: number) => Math.round(value * 100) / 100;
const point = (cx: number, cy: number, r: number, degrees: number): [number, number] => [
  cx + r * Math.cos((degrees * Math.PI) / 180),
  cy + r * Math.sin((degrees * Math.PI) / 180),
];
const move = ([x, y]: [number, number]) => `M${round(x)} ${round(y)}`;
const to = ([x, y]: [number, number]) => `L${round(x)} ${round(y)}`;

/**
 * The logo's drop as absolute path data: round end of radius `r` centred on (cx, cy),
 * tip `length` away in the direction `degrees` (0 = right, 90 = down).
 */
export function dropPath(cx: number, cy: number, r: number, length: number, degrees: number): string {
  // Drawn pointing up (tip at y = -length), then rotated so the tip faces `degrees`.
  const angle = ((degrees + 90) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (x: number, y: number) => `${round(cx + x * cos - y * sin)} ${round(cy + x * sin + y * cos)}`;
  const tip = -length;
  const near = tip + (length - r) * 0.35;
  const far = tip + (length - r) * 0.72;
  return [
    `M${at(0, tip)}`,
    `C${at(-r * 0.15, near)} ${at(-r, far)} ${at(-r, 0)}`,
    `A${round(r)} ${round(r)} 0 0 0 ${at(r, 0)}`,
    `C${at(r, far)} ${at(r * 0.15, near)} ${at(0, tip)}Z`,
  ].join('');
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${round(cx + r)} ${round(cy)}A${round(r)} ${round(r)} 0 1 0 ${round(cx - r)} ${round(cy)}A${round(r)} ${round(r)} 0 1 0 ${round(cx + r)} ${round(cy)}Z`;
}

export function andalusianPattern(tile = 144): PatternGeometry {
  const c = tile / 2;
  const star = 0.3 * tile; // radius of the star's eight points
  const lattice: string[] = [];

  // The khatam: an upright square and a square turned 45°, both through the eight points.
  for (const start of [45, 0]) {
    const corners = [0, 90, 180, 270].map((step) => point(c, c, star, start + step));
    lattice.push(move(corners[0]!) + corners.slice(1).map(to).join('') + 'Z');
  }
  // Strapwork: straight on to the next star (edge midpoints) and to the shared corners.
  for (const degrees of [0, 90, 180, 270]) lattice.push(move(point(c, c, star, degrees)) + to(point(c, c, tile / 2, degrees)));
  for (const degrees of [45, 135, 225, 315]) lattice.push(move(point(c, c, star, degrees)) + to(point(c, c, (tile / 2) * Math.SQRT2, degrees)));
  // Corner lozenges, completed by the four tiles that meet there.
  const half = 0.085 * tile;
  const corners: Array<[number, number]> = [
    [0, 0],
    [tile, 0],
    [0, tile],
    [tile, tile],
  ];
  for (const [x, y] of corners)
    lattice.push(`M${round(x)} ${round(y - half)}L${round(x + half)} ${round(y)}L${round(x)} ${round(y + half)}L${round(x - half)} ${round(y)}Z`);

  // The rosette: seven drops, round ends near the centre, tips reaching out into the star.
  const rosette = SEVEN.map((degrees) => dropPath(...point(c, c, 0.07 * tile, degrees), 0.026 * tile, 0.13 * tile, degrees)).join('');
  const seeds = corners.map(([x, y]) => circlePath(x, y, 0.018 * tile)).join('');
  return { tile, lattice: lattice.join(''), rosette, seeds };
}

export const pattern = andalusianPattern();

export interface PatternStyle {
  stroke: string;
  fill: string;
  strokeOpacity?: number;
  fillOpacity?: number;
  strokeWidth?: number;
  /** `lattice` leaves the rosettes out, for small surfaces (case covers, thumbnails). */
  detail?: 'full' | 'lattice';
  geometry?: PatternGeometry;
}

/** One repeatable tile as a standalone SVG (for CSS backgrounds, emails, print). */
export function patternTileSvg(style: PatternStyle): string {
  const geometry = style.geometry ?? pattern;
  const { tile } = geometry;
  const strokeOpacity = style.strokeOpacity ?? 1;
  const fillOpacity = style.fillOpacity ?? 1;
  const drops = style.detail === 'lattice' ? geometry.seeds : geometry.rosette + geometry.seeds;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">`,
    `<path d="${geometry.lattice}" fill="none" stroke="${style.stroke}" stroke-opacity="${strokeOpacity}" stroke-width="${style.strokeWidth ?? 1.1}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${drops}" fill="${style.fill}" fill-opacity="${fillOpacity}"/>`,
    '</svg>',
  ].join('');
}

/** `url("data:image/svg+xml,…")` for a CSS `background-image`. */
export function patternCssUrl(style: PatternStyle): string {
  return `url("data:image/svg+xml,${encodeURIComponent(patternTileSvg(style))}")`;
}

/** Pattern colours for a theme: the lattice in the brand colour, the drops in its gold, both kept quiet. */
export function patternStyleFor(theme: Theme, scheme: ColorScheme, detail: PatternStyle['detail'] = 'full'): PatternStyle {
  const colors = theme.colors[scheme];
  return scheme === 'light'
    ? { stroke: colors.primary, fill: colors.highlight, strokeOpacity: 0.14, fillOpacity: 0.26, detail }
    : { stroke: colors.primary, fill: colors.highlight, strokeOpacity: 0.13, fillOpacity: 0.22, detail };
}
