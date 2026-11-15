import { SCRIPT_LOGO, SCRIPT_LOGO_COLORS } from '@yusr/theme';
import { useId, type CSSProperties } from 'react';
import { cn } from './cn';

/** Wide enough for the pen (round-capped) to cover each letter's full stroke. */
const PEN_WIDTH = 58;
/** A small pause between letters, like lifting the pen. */
const LIFT_MS = 70;

/**
 * «خطّ اليُسر»: the logo, «يُسر» written by hand. With `writing`, each letter is revealed along the pen's
 * path in writing order (the ي and its dots, the س, the ر, then the ḍamma drops in), driven by the
 * `.script-pen` / `.script-damma` rules in the web stylesheet: without them (or with reduced motion) the
 * finished logo shows. `delayMs` holds the start. `highlight` dims every letter but one (the identity page's
 * «كيف يُكتب»).
 */
export function ScriptLogo({
  label,
  height = 40,
  writing = false,
  delayMs = 0,
  highlight,
  ink,
  accent,
  className,
}: {
  label: string;
  height?: number;
  writing?: boolean;
  delayMs?: number;
  highlight?: (typeof SCRIPT_LOGO.parts)[number]['id'][];
  /** The word's colour (the site's primary by default; white on the brand colour). */
  ink?: string;
  /** The ḍamma's colour (the site's highlight by default). */
  accent?: string;
  className?: string;
}) {
  const id = `ysl-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // When each letter starts: one after another, with a pen lift between.
  const starts = SCRIPT_LOGO.parts.reduce<number[]>(
    (list, part, index) => [...list, index === 0 ? delayMs : list[index - 1]! + SCRIPT_LOGO.parts[index - 1]!.ms + LIFT_MS],
    [],
  );
  const timing = (index: number) =>
    ({ ['--pen-at' as string]: `${starts[index]}ms`, ['--pen-ms' as string]: `${SCRIPT_LOGO.parts[index]!.ms}ms` }) as CSSProperties;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={SCRIPT_LOGO.viewBox}
      height={height}
      width={(height * SCRIPT_LOGO.width) / SCRIPT_LOGO.height}
      className={cn('script-logo shrink-0', writing && 'is-writing', className)}
    >
      <defs>
        {SCRIPT_LOGO.parts.map((part, index) =>
          part.pen && writing ? (
            <mask key={part.id} id={`${id}-${part.id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={SCRIPT_LOGO.width} height={SCRIPT_LOGO.height}>
              <path
                d={part.pen}
                pathLength={1}
                fill="none"
                stroke="#fff"
                strokeWidth={PEN_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="script-pen"
                style={timing(index)}
              />
            </mask>
          ) : null,
        )}
      </defs>
      {SCRIPT_LOGO.parts.map((part, index) => {
        const dim = highlight && !highlight.includes(part.id);
        return (
          <path
            key={part.id}
            d={part.fill}
            fill={(part.color === 'ink' ? ink : accent) ?? SCRIPT_LOGO_COLORS[part.color].css}
            opacity={dim ? 0.18 : undefined}
            mask={writing && part.pen ? `url(#${id}-${part.id})` : undefined}
            className={writing && !part.pen ? 'script-damma' : undefined}
            style={writing && !part.pen ? timing(index) : undefined}
          />
        );
      })}
    </svg>
  );
}
