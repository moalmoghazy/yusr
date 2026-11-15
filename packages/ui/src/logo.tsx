import type { Locale } from '@yusr/core';
import { brand, markViewBox, shineBandPath, type LogoGeometry } from '@yusr/theme';
import { useId } from 'react';
import { cn } from './cn';
import { ScriptLogo } from './script-logo';
import { textFor } from './text';

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The light inside the bowl (@yusr/theme LogoShine): turquoise and gold bands, kept on the bowl's stroke
 * and fading up its right arm. Ids derive from `id`, which must be unique in the page.
 */
export function MarkShine({
  logo,
  shine,
  gold,
  id,
  className,
  bandsClassName,
}: {
  logo: LogoGeometry;
  shine: string;
  gold: string;
  id: string;
  /** On the masked group (the light as a whole). */
  className?: string;
  /** On the bands inside the mask: move them and the light seems to move within the bowl. */
  bandsClassName?: string;
}) {
  if (!logo.shine) return null;
  const { bands, top, fade } = logo.shine;
  return (
    <>
      <defs>
        {bands.map((band, index) => (
          <radialGradient
            key={index}
            id={`${id}-b${index}`}
            gradientUnits="userSpaceOnUse"
            cx={0}
            cy={0}
            r={1}
            gradientTransform={`translate(${band.cx} ${band.cy}) scale(${band.rx} ${band.ry})`}
          >
            {band.stops.map(([offset, opacity], stop) => (
              <stop key={stop} offset={offset} style={{ stopColor: band.tone === 'gold' ? gold : shine, stopOpacity: opacity }} />
            ))}
          </radialGradient>
        ))}
        <linearGradient id={`${id}-f`} gradientUnits="userSpaceOnUse" x1={fade.x1} y1={fade.y1} x2={fade.x2} y2={fade.y2}>
          <stop offset={0} stopColor="#fff" />
          <stop offset={1} stopColor="#000" />
        </linearGradient>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={0} y={0} width={64} height={64}>
          <path d={logo.bowl.d} fill="none" stroke={`url(#${id}-f)`} strokeWidth={logo.bowl.strokeWidth} strokeLinecap="round" />
        </mask>
      </defs>
      <g mask={`url(#${id}-m)`} className={className}>
        <g className={bandsClassName}>
          {bands.map((band, index) => (
            <path key={index} d={shineBandPath(band, top)} fill={`url(#${id}-b${index})`} />
          ))}
        </g>
      </g>
    </>
  );
}

/** The mark's shapes on its 64-unit grid: the bowl of ي with its light (and, in the earlier versions, its two dots and the golden ḍamma). */
function MarkShapes({
  logo,
  bowl,
  drop,
  shine = 'var(--logo-shine)',
  size,
  maskId,
}: {
  logo: LogoGeometry;
  bowl: string;
  drop: string;
  shine?: string;
  size: number;
  maskId: string;
}) {
  const small = size < logo.dotsMinSize;
  const cutout = logo.dots?.style === 'cutout' && !small;
  return (
    <>
      {cutout && logo.dots && (
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
      <MarkShine logo={logo} shine={shine} gold={drop} id={`${maskId}-shine`} />
      {logo.dots?.style === 'solid' &&
        (small ? (
          // Too small for two dots: they join into one short stroke, as ي is written by hand in Ruqʿa.
          <line
            x1={logo.dots.items[0].cx}
            y1={logo.dots.items[0].cy}
            x2={logo.dots.items[1].cx}
            y2={logo.dots.items[1].cy}
            stroke={bowl}
            strokeWidth={logo.dots.items[0].r * 2}
            strokeLinecap="round"
          />
        ) : (
          logo.dots.items.map((dot) => <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill={bowl} />)
        ))}
      {logo.drop && <path d={logo.drop.d} fill={drop} transform={logo.drop.transform} />}
    </>
  );
}

export interface LogoMarkProps {
  /** Rendered size in px; below the geometry's `dotsMinSize` the dots are simplified. */
  size?: number;
  /** Bowl and dots colour (any CSS colour; the brand primary by default). */
  bowl?: string;
  /** The ḍamma's gold (the gold band inside the bowl). */
  drop?: string;
  /** The bright band inside the bowl. */
  shine?: string;
  /** Accessible name; decorative (hidden) without one. */
  title?: string;
  className?: string;
  logo?: LogoGeometry;
}

/**
 * The mark, drawn from @yusr/theme's geometry so every surface renders the same logo: the open bowl of ي
 * (cupped hands), lit from within with turquoise and gold. The box is cropped to the mark, so `size` is about its width.
 */
export function LogoMark({ size = 32, bowl = 'var(--primary)', drop = 'var(--highlight)', shine, title, className, logo = brand.logo }: LogoMarkProps) {
  const maskId = `ysr-dots-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox={markViewBox(logo)}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <MarkShapes logo={logo} bowl={bowl} drop={drop} shine={shine} size={size} maskId={maskId} />
    </svg>
  );
}

/**
 * The logo, «خطّ اليُسر» (the word «يُسر» written by hand, @yusr/theme script-logo.ts), named for assistive
 * tech. `size` is about the height of the word in px; `inverse` sets it in white for the brand colour.
 */
export function Logo({ locale, size = 30, inverse = false, className }: { locale: Locale; size?: number; inverse?: boolean; className?: string }) {
  return <ScriptLogo label={textFor(locale).t('a11y.logo')} height={round(size * 1.2)} ink={inverse ? '#FFFFFF' : undefined} className={className} />;
}
