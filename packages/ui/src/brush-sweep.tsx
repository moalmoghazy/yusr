import { BRUSH_SWEEP, SCRIPT_LOGO } from '@yusr/theme';
import { useId, type CSSProperties } from 'react';
import { cn } from './cn';

const RA = SCRIPT_LOGO.parts.find((part) => part.id === 'ra')!;

/**
 * The long sweep of the ر from «خطّ اليُسر», on its own: the site's one decorative shape, so every flourish
 * comes from the logo's hand. Filled with `currentColor` (set the colour and opacity with classes). With
 * `writing`, it is drawn along the logo's own pen like the header logo (`.script-pen` in the web stylesheet;
 * still without it). `stretch` lets it fill a box of any shape (a band, a card's edge).
 */
export function BrushSweep({
  className,
  writing = false,
  delayMs = 0,
  durationMs = 1400,
  stretch = false,
  flip = false,
}: {
  className?: string;
  writing?: boolean;
  delayMs?: number;
  durationMs?: number;
  stretch?: boolean;
  /** Mirror it, so it sweeps the other way. */
  flip?: boolean;
}) {
  const id = `ysw-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [x, y, width, height] = BRUSH_SWEEP.viewBox.split(' ').map(Number) as [number, number, number, number];
  return (
    <svg
      viewBox={BRUSH_SWEEP.viewBox}
      preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'}
      aria-hidden
      focusable="false"
      className={cn('script-logo pointer-events-none', writing && 'is-writing', className)}
    >
      {writing && RA.pen && (
        <defs>
          <mask id={id} maskUnits="userSpaceOnUse" x={x} y={y} width={width} height={height}>
            <path
              d={RA.pen}
              pathLength={1}
              fill="none"
              stroke="#fff"
              strokeWidth={70}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="script-pen"
              style={{ ['--pen-at' as string]: `${delayMs}ms`, ['--pen-ms' as string]: `${durationMs}ms` } as CSSProperties}
            />
          </mask>
        </defs>
      )}
      <path
        d={BRUSH_SWEEP.d}
        fill="currentColor"
        mask={writing ? `url(#${id})` : undefined}
        transform={flip ? `translate(${2 * x + width} 0) scale(-1 1)` : undefined}
      />
    </svg>
  );
}
