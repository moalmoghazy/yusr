import { CATEGORY_META, type CaseCategory, type CategoryTone } from '@yusr/core';
import { andalusianPattern } from '@yusr/theme';
import { useId } from 'react';
import { cn } from './cn';
import { ICON_NODES } from './icons';

/** The brand lattice at thumbnail scale (no rosettes; they turn to noise this small). */
const LATTICE = andalusianPattern(64);

/** Full class names per tone — Tailwind only generates what it can read in the source. */
const TONES: Readonly<Record<CategoryTone, { root: string; bg: string; glyph: string }>> = {
  rose: { root: 'text-tone-rose-solid', bg: 'fill-tone-rose-soft', glyph: 'text-tone-rose-soft-foreground' },
  slate: { root: 'text-tone-slate-solid', bg: 'fill-tone-slate-soft', glyph: 'text-tone-slate-soft-foreground' },
  sky: { root: 'text-tone-sky-solid', bg: 'fill-tone-sky-soft', glyph: 'text-tone-sky-soft-foreground' },
  gold: { root: 'text-tone-gold-solid', bg: 'fill-tone-gold-soft', glyph: 'text-tone-gold-soft-foreground' },
  teal: { root: 'text-tone-teal-solid', bg: 'fill-tone-teal-soft', glyph: 'text-tone-teal-soft-foreground' },
};

export interface CaseCoverProps {
  category: CaseCategory;
  /** The case's cover seed: shifts the lattice, the light and the motif so neighbouring cards differ. */
  seed: number;
  className?: string;
  /** Accessible name; the cover is decorative (hidden) without one. */
  label?: string;
}

/** The motif's size in viewBox units (a 24-unit icon at 3.4×) and where it sits: left edge, centred. */
const GLYPH_SCALE = 3.4;
const GLYPH_X = 40;
const GLYPH_Y = (180 - 24 * GLYPH_SCALE) / 2;

/**
 * The illustrated case cover. Yusr never shows beneficiaries' photos — dignity first — so
 * each category has a motif set on the brand's Andalusian lattice. Every cover puts its motif
 * in the same place (start of the card, vertically centred) so a row of cards lines up; the
 * lattice drifts left to right and fades out, like the home hero (`.case-cover-drift` in the
 * web stylesheet; still under reduced motion). Deterministic: the seed only shifts the lattice
 * and the light, so the server and client draw the same cover.
 */
export function CaseCover({ category, seed, className, label }: CaseCoverProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const patternId = `ysr-cover-${uid}`;
  const fadeId = `ysr-cover-fade-${uid}`;
  const tone = TONES[CATEGORY_META[category].tone];
  const variant = seed % 4;
  const orbX = 60 + (seed % 7) * 26;
  const orbY = 40 + (seed % 5) * 22;

  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className={cn('block', tone.root, className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <pattern
          id={patternId}
          width={LATTICE.tile}
          height={LATTICE.tile}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${(seed * 13) % LATTICE.tile} ${(seed * 7) % LATTICE.tile})`}
        >
          <path d={LATTICE.lattice} fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          <path d={LATTICE.seeds} fill="currentColor" />
        </pattern>
        <linearGradient id={`${fadeId}-g`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0.3" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={fadeId} maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="180">
          <rect width="320" height="180" fill={`url(#${fadeId}-g)`} />
        </mask>
      </defs>
      <rect width="320" height="180" className={tone.bg} />
      <g mask={`url(#${fadeId})`}>
        <g className="case-cover-drift" style={{ ['--cover-tile' as string]: `${LATTICE.tile}px` }}>
          <rect x={-LATTICE.tile} width={320 + LATTICE.tile} height="180" fill={`url(#${patternId})`} opacity={0.2} />
        </g>
      </g>
      <circle cx={orbX} cy={orbY} r={70 + variant * 12} fill="currentColor" opacity={0.09} />
      <circle cx={320 - orbX / 2} cy={170 - orbY / 3} r={36 + variant * 6} fill="currentColor" opacity={0.07} />
      <g
        transform={`translate(${GLYPH_X} ${GLYPH_Y}) scale(${GLYPH_SCALE})`}
        className={tone.glyph}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICON_NODES[CATEGORY_META[category].icon].map(([Tag, attrs], index) => (
          <Tag key={index} {...attrs} />
        ))}
      </g>
    </svg>
  );
}
