'use client';

import { cn } from '@yusr/ui';
import { Children, useEffect, useState, type ReactNode } from 'react';

const EVERY_MS = 6000;

/**
 * The cases moderators chose for «يحدث الآن», one at a time: the next one every few seconds, paused
 * while the pointer or keyboard focus is on it, with dots to pick one. A single case just shows.
 */
export function FeaturedRotator({ children, labels }: { children: ReactNode; labels: string[] }) {
  const slides = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % slides.length), EVERY_MS);
    return () => clearInterval(timer);
  }, [slides.length, paused]);

  if (slides.length < 2) return <>{slides}</>;
  return (
    <div
      className="flex flex-col gap-2"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="grid">
        {slides.map((slide, position) => (
          <div
            key={position}
            aria-hidden={position !== index}
            inert={position !== index}
            className={cn('col-start-1 row-start-1 transition-opacity duration-500', position === index ? 'opacity-100' : 'pointer-events-none opacity-0')}
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5">
        {slides.map((_, position) => (
          <button
            key={position}
            type="button"
            aria-label={labels[position]}
            aria-current={position === index}
            onClick={() => setIndex(position)}
            className={cn('h-1.5 rounded-full transition-all', position === index ? 'w-5 bg-highlight' : 'w-1.5 bg-border hover:bg-muted-foreground')}
          />
        ))}
      </div>
    </div>
  );
}
