'use client';

import { cn } from '@yusr/ui';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/** The SVG filter the glass bends the page through (Chromium can use an SVG filter as a backdrop-filter). */
const FILTER_ID = 'yusr-liquid-glass';

/**
 * A pane of «liquid glass» (globals.css, `.lg-*`): the page behind it is bent as if through a thick lens,
 * lightly blurred and brightened, with a bright rim and a highlight that follows the pointer.
 *
 * Layers, back to front: the lens (backdrop-filter; the refraction is added only where the browser can
 * filter the backdrop through SVG, i.e. Chromium; elsewhere it is a frosted pane), a tint, the specular
 * highlight and rim, then the content. With reduced transparency it is a plain solid bar.
 */
export function LiquidGlass({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [refract, setRefract] = useState(false);

  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands ?? [];
    setRefract(brands.some((entry) => /chromium/i.test(entry.brand)));
  }, []);

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || event.pointerType !== 'mouse') return;
    ref.current!.style.setProperty('--lg-x', `${(((event.clientX - box.left) / box.width) * 100).toFixed(1)}%`);
    ref.current!.style.setProperty('--lg-y', `${(((event.clientY - box.top) / box.height) * 100).toFixed(1)}%`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={follow}
      onPointerLeave={() => ref.current?.style.removeProperty('--lg-x')}
      data-refract={refract || undefined}
      className={cn('lg-pane', className)}
    >
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter id={FILTER_ID} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* A slow, smooth field of noise moves each point of the page a little: the wobble of thick glass. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.018" numOctaves="2" seed="11" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2.5" result="field" />
          <feDisplacementMap in="SourceGraphic" in2="field" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <span aria-hidden className="lg-lens" />
      <span aria-hidden className="lg-tint" />
      <span aria-hidden className="lg-shine" />
      <div className="relative">{children}</div>
    </div>
  );
}
