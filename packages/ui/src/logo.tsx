import type { Locale } from '@yusr/core';
import { brand, lockup, wordmark, type LockupLayout, type LogoGeometry, type WordmarkGeometry } from '@yusr/theme';
import { useId } from 'react';
import { cn } from './cn';
import { textFor } from './text';

const round = (value: number) => Math.round(value * 100) / 100;

/** The mark's shapes on its 64-unit grid: the bowl of ي, its two dots and the golden ḍamma. */
function MarkShapes({ logo, bowl, drop, size, maskId }: { logo: LogoGeometry; bowl: string; drop: string; size: number; maskId: string }) {
  const small = size < logo.dotsMinSize;
  const cutout = logo.dots.style === 'cutout' && !small;
  const [first, second] = logo.dots.items;
  return (
    <>
      {cutout && (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={-8} y={-8} width={80} height={80}>
            <rect x={-8} y={-8} width={80} height={80} fill="#fff" />
            {logo.dots.items.map((dot) => (
              <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill="#000" />
            ))}
          </mask>
        </defs>
      )}
      <path d={logo.bowl.d} fill="none" stroke={bowl} strokeWidth={logo.bowl.strokeWidth} strokeLinecap="round" mask={cutout ? `url(#${maskId})` : undefined} />
      {logo.dots.style === 'solid' &&
        (small ? (
          // Too small for two dots: they join into one short stroke, as ي is written by hand in Ruqʿa.
          <line x1={first.cx} y1={first.cy} x2={second.cx} y2={second.cy} stroke={bowl} strokeWidth={first.r * 2} strokeLinecap="round" />
        ) : (
          logo.dots.items.map((dot) => <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill={bowl} />)
        ))}
      <path d={logo.drop.d} fill={drop} transform={logo.drop.transform} />
    </>
  );
}

/** The approved lettering of «يُسر»: the letters with the dots of ي, and the golden ḍamma (see @yusr/theme wordmark.ts). */
function WordmarkShapes({ word, ink, drop }: { word: WordmarkGeometry; ink: string; drop: string }) {
  return (
    <>
      <path d={word.ink.d} fill={ink} fillRule="evenodd" />
      <path d={word.damma.d} fill={drop} fillRule="evenodd" />
    </>
  );
}

export interface LogoMarkProps {
  /** Rendered size in px; below the geometry's `dotsMinSize` the dots are simplified. */
  size?: number;
  /** Bowl and dots colour (any CSS colour; the brand primary by default). */
  bowl?: string;
  /** The golden ḍamma. */
  drop?: string;
  /** Accessible name; decorative (hidden) without one. */
  title?: string;
  className?: string;
  logo?: LogoGeometry;
}

/**
 * The mark, drawn from @yusr/theme's geometry so every surface renders the same logo:
 * the open bowl of ي (cupped hands), its two dots and the golden ḍamma above.
 */
export function LogoMark({ size = 32, bowl = 'var(--primary)', drop = 'var(--highlight)', title, className, logo = brand.logo }: LogoMarkProps) {
  const maskId = `ysr-dots-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox={logo.viewBox}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <MarkShapes logo={logo} bowl={bowl} drop={drop} size={size} maskId={maskId} />
    </svg>
  );
}

/**
 * Mark + name, named for assistive tech. The name is set in the logo face (Reem Kufi) beside the
 * mark; with `wordmark="lettered"` the Arabic name is instead the approved lettering, drawn on the
 * mark's grid (@yusr/theme wordmark.ts). `size` is the mark's size in px, as for <LogoMark>.
 */
export function Logo({
  locale,
  size = 30,
  inverse = false,
  className,
  wordmark: style = brand.wordmark,
  animated = false,
}: {
  locale: Locale;
  size?: number;
  inverse?: boolean;
  className?: string;
  wordmark?: 'typeset' | 'lettered';
  /**
   * The header's loop (Arabic lettered lockup): «يُسر» slides out of the mark, rests, and slides back
   * in (`.logo-word` in the web stylesheet; still under reduced motion, and the word simply shows
   * without the stylesheet).
   */
  animated?: boolean;
}) {
  const maskId = `ysr-lockup-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ink = inverse ? '#FFFFFF' : 'var(--primary)';
  const label = textFor(locale).t('a11y.logo');
  if (locale === 'ar' && style === 'lettered') {
    const layout: LockupLayout = lockup;
    const scale = size / 64;
    return (
      <svg
        role="img"
        aria-label={label}
        viewBox={layout.viewBox}
        width={round(layout.width * scale)}
        height={round(layout.height * scale)}
        className={cn('shrink-0', className)}
        focusable="false"
      >
        {animated ? (
          <>
            <defs>
              {/* The word is only seen left of the mark, so it seems to come out of it and go back in. */}
              <clipPath id={`${maskId}-clip`}>
                <rect x={-120} y={-20} width={120 + brand.logo.bounds.x + 1} height={110} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${maskId}-clip)`}>
              <g className="logo-word" style={{ ['--logo-word-travel' as string]: `${round(-wordmark.bounds.x + brand.logo.bounds.x + 2)}px` }}>
                <WordmarkShapes word={wordmark} ink={ink} drop="var(--highlight)" />
              </g>
            </g>
          </>
        ) : (
          <WordmarkShapes word={wordmark} ink={ink} drop="var(--highlight)" />
        )}
        <g transform={`translate(${layout.markX} 0)`}>
          <MarkShapes logo={brand.logo} bowl={ink} drop="var(--highlight)" size={size} maskId={maskId} />
        </g>
      </svg>
    );
  }
  // In Arabic the mark leads on the right (the page is right-to-left); in English, on the left.
  return (
    <span role="img" aria-label={label} className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} bowl={ink} />
      <span
        aria-hidden
        className={cn('font-logo font-bold leading-none', inverse ? 'text-white' : 'text-primary')}
        style={{ fontSize: size * (locale === 'ar' ? 0.84 : 0.78) }}
      >
        {brand.name[locale]}
      </span>
    </span>
  );
}
