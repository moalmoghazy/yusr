'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Plays the «كيف نعمل» steps when they scroll into view, not on page load (on phones they sit below
 * the fold), and again each time they scroll back into view after leaving it. Without JavaScript nothing is hidden: the steps simply show, as with reduced motion.
 */
export function HowReveal({ className, labelledBy, children }: { className: string; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.dataset['how'] = 'armed';
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        // Once it has left the screen completely, the next time it comes back plays the steps again.
        if (!entry.isIntersecting) node.dataset['how'] = 'armed';
        else if (entry.intersectionRatio >= 0.35) node.dataset['how'] = 'run';
      },
      { threshold: [0, 0.35] },
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
