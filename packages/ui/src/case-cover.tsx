import { CATEGORY_META, type CaseCategory, type CategoryTone } from '@yusr/core';
import { BRUSH_SWEEP } from '@yusr/theme';
import type { CSSProperties } from 'react';
import { cn } from './cn';
import { ICON_NODES } from './icons';

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
  /** The case's cover seed: shifts the sweep and the light so neighbouring cards differ. */
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
 * each category has a motif over a sweep of the ر from the logo. Every cover puts its motif
 * in the same place (start of the card, vertically centred) so a row of cards lines up. The motif
 * draws itself and rests, in a loop (`.cover-morph-icon`; without the animation it simply shows).
 * Deterministic: the seed only shifts the sweep
 * and the light, so the server and client draw the same cover.
 */

/** Neighbouring covers start the loop at different moments, so a row of cards doesn't move in step. */
const morphTiming = (seed: number): CSSProperties => ({ ['--morph-delay' as string]: `${-((seed * 1.7) % 9).toFixed(1)}s` });

export function CaseCover({ category, seed, className, label }: CaseCoverProps) {
  const tone = TONES[CATEGORY_META[category].tone];
  const variant = seed % 4;
  const orbX = 60 + (seed % 7) * 26;
  const orbY = 40 + (seed % 5) * 22;
  const sweepX = 40 + (seed % 5) * 12;
  const sweepY = 10 + (seed % 3) * 12;
  const sweepTilt = -8 + (seed % 4) * 4;

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
      <rect width="320" height="180" className={tone.bg} />
      {/* The ر's sweep from the logo behind the motif, a little different on every card. */}
      <g transform={`translate(${sweepX} ${sweepY}) rotate(${sweepTilt} 103 50) scale(1.45)`} opacity={0.16}>
        <path d={BRUSH_SWEEP.d} transform="translate(-7 -86)" fill="currentColor" />
      </g>
      <circle cx={orbX} cy={orbY} r={70 + variant * 12} fill="currentColor" opacity={0.09} />
      <circle cx={320 - orbX / 2} cy={170 - orbY / 3} r={36 + variant * 6} fill="currentColor" opacity={0.07} />
      <g className={tone.glyph} style={morphTiming(seed)}>
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
      </g>
    </svg>
  );
}
