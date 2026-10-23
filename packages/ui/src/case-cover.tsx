import { CATEGORY_META, type CaseCategory, type CategoryTone } from '@yusr/core';
import { andalusianPattern, brand } from '@yusr/theme';
import type { CSSProperties } from 'react';
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

/** The Yusr mark in the motif's box, for the loop where it turns into the category's motif: centred on the motif and as tall as it. */
const LOGO = brand.logo;
const MARK_SCALE = (24 * GLYPH_SCALE * 0.92) / LOGO.bounds.height;
const MARK_X = GLYPH_X + 12 * GLYPH_SCALE - MARK_SCALE * (LOGO.bounds.x + LOGO.bounds.width / 2);
const MARK_Y = GLYPH_Y + 12 * GLYPH_SCALE - MARK_SCALE * (LOGO.bounds.y + LOGO.bounds.height / 2);

/**
 * The illustrated case cover. Yusr never shows beneficiaries' photos — dignity first — so
 * each category has a motif set on the brand's Andalusian lattice. Every cover puts its motif
 * in the same place (start of the card, vertically centred) so a row of cards lines up; the
 * lattice drifts left to right and fades out, like the home hero (`.case-cover-drift` in the
 * web stylesheet; still under reduced motion). The motif itself is a loop: the Yusr mark is drawn and its
 * golden ḍamma falls onto it like a drop of water; then the ḍamma fades as the mark turns into the motif,
 * and back (`.cover-morph-*`; without the animation only the motif shows). Deterministic: the seed only shifts the lattice
 * and the light, so the server and client draw the same cover.
 */
const r2 = (value: number) => Math.round(value * 100) / 100;

/** Neighbouring covers start the loop at different moments, so a row of cards doesn't move in step. */
const morphTiming = (seed: number): CSSProperties => ({ ['--morph-delay' as string]: `${-((seed * 1.7) % 9).toFixed(1)}s` });

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
      <g className={tone.glyph} style={morphTiming(seed)}>
        {/* The Yusr mark, which turns into the motif and back (hidden without the stylesheet's animation). */}
        <g transform={`translate(${r2(MARK_X)} ${r2(MARK_Y)}) scale(${r2(MARK_SCALE)})`} className="cover-morph-mark" style={{ opacity: 0 }}>
          <path d={LOGO.bowl.d} pathLength={1} fill="none" stroke="currentColor" strokeWidth={LOGO.bowl.strokeWidth} strokeLinecap="round" />
          {LOGO.dots.items.map((dot) => (
            <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill="currentColor" />
          ))}
        </g>
        <g
          transform={`translate(${GLYPH_X} ${GLYPH_Y}) scale(${GLYPH_SCALE})`}
          className="cover-morph-icon"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICON_NODES[CATEGORY_META[category].icon].map(([Tag, attrs], index) => (
            <Tag key={index} {...attrs} pathLength={1} />
          ))}
        </g>
        {/* The golden ḍamma: falls onto the mark like a drop of water, and fades as the mark turns into the motif. */}
        <g transform={`translate(${r2(MARK_X)} ${r2(MARK_Y)}) scale(${r2(MARK_SCALE)})`}>
          <g className="cover-morph-drop" style={{ opacity: 0, transformOrigin: `${LOGO.guides.drop.cx}px ${LOGO.guides.drop.cy}px` }}>
            <path d={LOGO.drop.d} transform={LOGO.drop.transform} className="fill-highlight" />
          </g>
        </g>
      </g>
    </svg>
  );
}
