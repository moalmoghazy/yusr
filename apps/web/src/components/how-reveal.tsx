'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Plays the «كيف نعمل» steps when they scroll into view, not on page load (on phones they sit below
 * the fold). Without JavaScript nothing is hidden: the steps simply show, as with reduced motion.
 */
export function HowReveal({ className, labelledBy, children }: { className: string; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.dataset['how'] = 'armed';
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        node.dataset['how'] = 'run';
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <section ref={ref} id="how" aria-labelledby={labelledBy} className={className}>
      {children}
    </section>
  );
}
