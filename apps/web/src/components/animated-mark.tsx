'use client';

import { brand } from '@yusr/theme';
import { Icon } from '@yusr/ui';
import { useRef, useState, type PointerEvent } from 'react';

/**
 * «الضمّة الذهبية», drawn live: the bowl of ي is written, its two dots appear, then the golden ḍamma
 * falls into place with a ripple. The drop leans towards the pointer; a click on the mark (or the
 * button) plays it again. With reduced motion the finished mark is shown still.
 */
export function AnimatedMark({ label, replayLabel }: { label: string; replayLabel: string }) {
  const { logo } = brand;
  const [run, setRun] = useState(0);
  const stage = useRef<HTMLDivElement>(null);

  const lean = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    event.currentTarget.style.setProperty('--ym-x', x.toFixed(3));
    event.currentTarget.style.setProperty('--ym-y', y.toFixed(3));
  };
  const settle = () => {
    stage.current?.style.setProperty('--ym-x', '0');
    stage.current?.style.setProperty('--ym-y', '0');
  };
  const replay = () => setRun((value) => value + 1);

  return (
    <div className="flex flex-col items-center gap-5">
      <div ref={stage} className="ym-stage" onPointerMove={lean} onPointerLeave={settle} onClick={replay}>
        <svg key={run} viewBox="-18 -18 100 100" className="ym-mark" role="img" aria-label={label}>
          <defs>
            <radialGradient id="ym-glow" cx="50%" cy="42%" r="50%">
              <stop offset="0" style={{ stopColor: 'var(--highlight)', stopOpacity: 0.34 }} />
              <stop offset="0.55" style={{ stopColor: 'var(--highlight)', stopOpacity: 0.08 }} />
              <stop offset="1" style={{ stopColor: 'var(--highlight)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <circle cx="32" cy="30" r="50" fill="url(#ym-glow)" className="ym-glow" />
          <circle cx="32" cy="32" r="44" className="ym-ring" />
          <circle cx="32" cy="32" r="35" className="ym-ring ym-ring-2" />
          <path d={logo.bowl.d} pathLength={100} className="ym-bowl" strokeWidth={logo.bowl.strokeWidth} />
          {logo.dots.items.map((dot) => (
            <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} className="ym-dot" />
          ))}
          <circle cx={logo.guides.drop.cx} cy={logo.guides.drop.cy} r={logo.guides.drop.r} className="ym-ripple" />
          <g className="ym-lean">
            <g className="ym-drop">
              <path d={logo.drop.d} transform={logo.drop.transform} />
            </g>
          </g>
        </svg>
      </div>
      <button
        type="button"
        onClick={replay}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:hidden"
      >
        <Icon name="refresh" size={16} />
        {replayLabel}
      </button>
    </div>
  );
}
