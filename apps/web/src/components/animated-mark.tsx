'use client';

import { brand } from '@yusr/theme';
import { Icon } from '@yusr/ui';
import { useEffect, useRef, useState } from 'react';

/**
 * «الضمّة الذهبية», drawn live: the bowl of ي is written, its two dots appear, then the golden ḍamma
 * falls into place with a ripple. Wherever the pointer moves on the page, the ḍamma moves towards it
 * (the nearer, the less); a click on the mark (or the button) plays it again. With reduced motion
 * the finished mark is shown still.
 */
export function AnimatedMark({ label, replayLabel }: { label: string; replayLabel: string }) {
  const { logo } = brand;
  const [run, setRun] = useState(0);
  const stage = useRef<HTMLDivElement>(null);

  // Follow the pointer across the whole page: a unit direction from the mark to the pointer, scaled
  // by distance (full lean from ~320px away), written to two CSS variables once per frame.
  useEffect(() => {
    const element = stage.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let target = { x: 0, y: 0 };
    const paint = () => {
      frame = 0;
      element.style.setProperty('--ym-x', target.x.toFixed(3));
      element.style.setProperty('--ym-y', target.y.toFixed(3));
    };
    const follow = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height * 0.3);
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(distance / 320, 1);
      target = { x: (dx / distance) * reach, y: (dy / distance) * reach };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const rest = () => {
      target = { x: 0, y: 0 };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener('pointermove', follow, { passive: true });
    document.documentElement.addEventListener('pointerleave', rest);
    return () => {
      window.removeEventListener('pointermove', follow);
      document.documentElement.removeEventListener('pointerleave', rest);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  const replay = () => setRun((value) => value + 1);

  return (
    <div className="flex flex-col items-center gap-5">
      <div ref={stage} className="ym-stage" onClick={replay}>
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
