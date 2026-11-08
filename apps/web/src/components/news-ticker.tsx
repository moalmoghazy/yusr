'use client';

import { Icon } from '@yusr/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface NewsItem {
  id: string;
  href: string;
  headline: string;
  detail: string;
  /** «الإسماعيلية · منذ ٣ أسابيع» */
  meta: string;
}

/** How long one item stays, and how long it takes to leave. */
const SHOW_MS = 5_500;
const OUT_MS = 600;

/**
 * «آخر الأخبار» in the hero: the latest cases that were funded or closed, one at a time. Each comes in
 * from the left and leaves to the right (in both languages, like «شركاء يُسر»), fading as it moves.
 * Resting the pointer on it (or focusing it) holds the current item. With reduced motion it only
 * fades (globals.css, `.news-*`).
 */
export function NewsTicker({ items, label }: { items: NewsItem[]; label: string }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || items.length < 2) return;
    const out = window.setTimeout(() => setLeaving(true), SHOW_MS);
    const next = window.setTimeout(() => {
      setLeaving(false);
      setIndex((current) => (current + 1) % items.length);
    }, SHOW_MS + OUT_MS);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(next);
    };
  }, [index, held, items.length]);

  const item = items[index];
  if (!item) return null;
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-2 rounded-card border border-border/70 bg-card/75 p-4 shadow-sm backdrop-blur-sm"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <p className="inline-flex items-center gap-2 text-xs font-bold text-primary">
        <span aria-hidden className="news-pulse size-2 rounded-full bg-highlight" />
        {label}
      </p>
      {/* Polite: a screen reader hears each new item once it has settled, not mid-animation. */}
      <div className="overflow-hidden" aria-live={held ? 'off' : 'polite'}>
        <Link key={item.id} href={item.href} data-state={leaving ? 'out' : 'in'} className="news-item group flex flex-col gap-1 outline-none">
          <span className="line-clamp-2 font-bold leading-snug group-hover:text-primary group-focus-visible:underline">{item.headline}</span>
          <span className="line-clamp-1 text-sm text-muted-foreground">{item.detail}</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="clock" size={13} />
            {item.meta}
          </span>
        </Link>
      </div>
    </section>
  );
}
