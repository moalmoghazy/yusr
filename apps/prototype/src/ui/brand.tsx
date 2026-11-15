import { SCRIPT_LOGO, SCRIPT_LOGO_COLORS, brand } from '@yusr/theme';
import { useI18n } from '@yusr/i18n/react';
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { usePrototype } from '../app/prefs';
import { cx } from './primitives';

type PartId = (typeof SCRIPT_LOGO.parts)[number]['id'];

/** Wide enough for the round pen to cover each letter's stroke; a short pause between letters. */
const PEN_WIDTH = 58;
const LIFT_MS = 70;
/** The whole writing, then (looping) the rest before it fades and is written again. */
export const WRITING_MS = SCRIPT_LOGO.parts.reduce((sum, part) => sum + part.ms + LIFT_MS, 0);
const HOLD_MS = 4000;
const FADE_MS = 500;

/**
 * «خطّ اليُسر», the logo (as @yusr/ui ScriptLogo on the website): the word «يُسر» written by hand, turquoise
 * with a sand-gold ḍamma. With `writing`, each letter is revealed along the pen in order (ي and its dots, س,
 * ر, then the ḍamma drops in; `.script-pen` / `.script-damma` in brand.css). `highlight` dims all but some.
 */
export function ScriptMark({
  height = 40,
  ink = SCRIPT_LOGO_COLORS.ink.css,
  accent = SCRIPT_LOGO_COLORS.accent.css,
  writing = false,
  delayMs = 0,
  highlight,
  title,
  className,
}: {
  height?: number;
  ink?: string;
  accent?: string;
  writing?: boolean;
  delayMs?: number;
  highlight?: readonly PartId[];
  title?: string;
  className?: string;
}) {
  const id = `ysm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const starts = SCRIPT_LOGO.parts.reduce<number[]>(
    (list, part, index) => [...list, index === 0 ? delayMs : list[index - 1]! + SCRIPT_LOGO.parts[index - 1]!.ms + LIFT_MS],
    [],
  );
  const timing = (index: number) =>
    ({ ['--pen-at' as string]: `${starts[index]}ms`, ['--pen-ms' as string]: `${SCRIPT_LOGO.parts[index]!.ms}ms` }) as CSSProperties;
  return (
    <svg
      viewBox={SCRIPT_LOGO.viewBox}
      height={height}
      width={Math.round((height * SCRIPT_LOGO.width) / SCRIPT_LOGO.height)}
      className={cx('script-logo', writing && 'is-writing', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {writing && (
        <defs>
          {SCRIPT_LOGO.parts.map((part, index) =>
            part.pen ? (
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
      )}
      {SCRIPT_LOGO.parts.map((part, index) => (
        <path
          key={part.id}
          d={part.fill}
          fill={part.color === 'ink' ? ink : accent}
          opacity={highlight && !highlight.includes(part.id) ? 0.18 : undefined}
          mask={writing && part.pen ? `url(#${id}-${part.id})` : undefined}
          className={writing && !part.pen ? 'script-damma' : undefined}
          style={writing && !part.pen ? timing(index) : undefined}
        />
      ))}
    </svg>
  );
}

/** The logo writing itself, again and again: written, held, faded, written again (still under reduced motion). */
export function WritingMark({ height, ink, still = false, className }: { height: number; ink?: string; still?: boolean; className?: string }) {
  const [run, setRun] = useState(0);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (still) return;
    const fade = window.setTimeout(() => setFading(true), (run === 0 ? 150 : 0) + WRITING_MS + HOLD_MS);
    const again = window.setTimeout(
      () => {
        setFading(false);
        setRun((value) => value + 1);
      },
      (run === 0 ? 150 : 0) + WRITING_MS + HOLD_MS + FADE_MS,
    );
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(again);
    };
  }, [run, still]);
  return (
    <ScriptMark
      key={run}
      height={height}
      ink={ink}
      writing={!still}
      delayMs={run === 0 ? 150 : 0}
      className={cx('script-loop', fading && 'is-fading', className)}
    />
  );
}

/** The logo at about `size` px tall (kept for the places that drew the earlier square mark). */
export function LogoMark({ size = 32, bowl, drop, className, title }: { size?: number; bowl?: string; drop?: string; className?: string; title?: string }) {
  return <ScriptMark height={Math.round(size * 0.8)} ink={bowl} accent={drop} className={className} title={title} />;
}

/** The name alone (splash screens, receipts): the logo itself. */
export function Wordmark({ height, ink, drop, className }: { height: number; ink?: string; drop?: string; className?: string }) {
  return <ScriptMark height={height} ink={ink} accent={drop} className={className} />;
}

/** The header logo: «خطّ اليُسر» in both languages (it is the name in Arabic letters). */
export function Lockup({
  size = 30,
  bowl,
  drop,
  ink,
  className,
}: {
  lang: 'ar' | 'en';
  size?: number;
  bowl?: string;
  drop?: string;
  ink?: string;
  className?: string;
}) {
  return <ScriptMark height={Math.round(size * 1.2)} ink={ink ?? bowl} accent={drop} className={className} />;
}

/** The header logo, writing itself on a loop (the website's header does the same). */
export function Logo({ size = 30, inverse = false, className }: { size?: number; inverse?: boolean; className?: string }) {
  const { t } = useI18n();
  const { reducedMotion } = usePrototype();
  return (
    <span className={cx('logo', inverse && 'logo-inverse', className)} aria-label={`${t('a11y.logo')} · ${brand.name.en}`} role="img">
      <WritingMark height={Math.round(size * 1.2)} ink={inverse ? '#FFFFFF' : undefined} still={reducedMotion} />
    </span>
  );
}
