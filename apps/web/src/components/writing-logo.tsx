'use client';

import { ScriptLogo } from '@yusr/ui';
import { useRef, useState } from 'react';

/** The whole writing takes about this long; hovering again before it ends does not restart it. */
const WRITING_MS = 2600;

/**
 * «خطّ اليُسر» writing itself: once when the page opens, and again whenever the pointer comes back to it
 * (or the replay button on the identity page is pressed: `replayLabel`).
 */
export function WritingLogo({
  label,
  height,
  delayMs = 150,
  replayLabel,
  className,
}: {
  label: string;
  height: number;
  delayMs?: number;
  replayLabel?: string;
  className?: string;
}) {
  const [run, setRun] = useState(0);
  const last = useRef(0);
  const replay = () => {
    const now = Date.now();
    if (now - last.current < WRITING_MS) return;
    last.current = now;
    setRun((current) => current + 1);
  };
  return (
    <span className="inline-flex flex-col items-center gap-3" onMouseEnter={replayLabel ? undefined : replay}>
      <ScriptLogo key={run} label={label} height={height} writing delayMs={run === 0 ? delayMs : 0} className={className} />
      {replayLabel && (
        <button type="button" onClick={() => setRun((current) => current + 1)} className="text-sm font-semibold text-primary hover:underline">
          {replayLabel}
        </button>
      )}
    </span>
  );
}
