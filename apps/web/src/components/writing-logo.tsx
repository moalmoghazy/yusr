'use client';

import { cn, ScriptLogo } from '@yusr/ui';
import { useEffect, useRef, useState } from 'react';

/** The whole writing takes about this long; hovering again before it ends does not restart it. */
const WRITING_MS = 2600;
/** With `loop`: how long the finished logo stays before it fades and is written again. */
const HOLD_MS = 4000;
/** Matches the `duration-500` fade on the logo. */
const FADE_MS = 500;

/**
 * «خطّ اليُسر» writing itself: once when the page opens, and again whenever the pointer comes back to it
 * (or the replay button on the identity page is pressed: `replayLabel`). With `loop` (the header) it keeps
 * writing: written, held, faded out, written again. Reduced motion shows the finished logo once.
 */
export function WritingLogo({
  label,
  height,
  delayMs = 150,
  replayLabel,
  loop = false,
  className,
}: {
  label: string;
  height: number;
  delayMs?: number;
  replayLabel?: string;
  loop?: boolean;
  className?: string;
}) {
  const [run, setRun] = useState(0);
  const [fading, setFading] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    if (!loop || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const written = (run === 0 ? delayMs : 0) + WRITING_MS + HOLD_MS;
    const fade = window.setTimeout(() => setFading(true), written);
    const again = window.setTimeout(() => {
      last.current = Date.now();
      setFading(false);
      setRun((current) => current + 1);
    }, written + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(again);
    };
  }, [loop, run, delayMs]);
  const replay = () => {
    const now = Date.now();
    if (now - last.current < WRITING_MS) return;
    last.current = now;
    setRun((current) => current + 1);
  };
  return (
    <span className="inline-flex flex-col items-center gap-3" onMouseEnter={replayLabel || loop ? undefined : replay}>
      <ScriptLogo
        key={run}
        label={label}
        height={height}
        writing
        delayMs={run === 0 ? delayMs : 0}
        className={cn('transition-opacity duration-500 ease-out', fading && 'opacity-0', className)}
      />
      {replayLabel && (
        <button type="button" onClick={() => setRun((current) => current + 1)} className="text-sm font-semibold text-primary hover:underline">
          {replayLabel}
        </button>
      )}
    </span>
  );
}
