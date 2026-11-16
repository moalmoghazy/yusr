'use client';

import { VineSweep, type VineSweepProps } from '@yusr/ui';
import { useEffect, useState } from 'react';

/**
 * «الغصن المتعرّش» growing over and over: it grows, rests, fades out softly, then grows again
 * (every `periodMs`). `className` places and colours the box; the branch fills it. With reduced motion
 * it is simply there, once.
 */
export function VineLoop({ periodMs = 11000, className, ...vine }: Omit<VineSweepProps, 'growing' | 'className'> & { periodMs?: number; className?: string }) {
  const [round, setRound] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let fade = window.setTimeout(() => setFading(true), periodMs - 1200);
    const tick = window.setInterval(() => {
      setFading(false);
      setRound((value) => value + 1);
      fade = window.setTimeout(() => setFading(true), periodMs - 1200);
    }, periodMs);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(fade);
    };
  }, [periodMs]);

  return (
    <div aria-hidden className={className} style={{ transition: 'opacity 1s ease', ...(fading ? { opacity: 0 } : {}) }}>
      <VineSweep key={round} growing {...vine} className="block size-full" />
    </div>
  );
}
