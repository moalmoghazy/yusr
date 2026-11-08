'use client';

import type { CaseCategory } from '@yusr/core';
import { cn, Icon, StoryScene } from '@yusr/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export interface ReelStory {
  id: string;
  category: CaseCategory;
  href: string;
  /** «علاج · الإسماعيلية» */
  meta: string;
  title: string;
  story: string;
  /** How it ended (the case summary once closed). */
  outcome: string;
  raised: string;
  donors: string;
  closed: string;
  confirmed: string | null;
}

/** How long one story stays, and how long it takes to fade out before the next. */
const SHOW_MS = 9_000;
const OUT_MS = 700;

/**
 * «قصص نجاح» told one at a time: the scene where the help landed (faces blurred), then its title,
 * then the story, each fading in; after a while it all fades out and the next story comes in.
 * Resting the pointer on it (or focusing inside it) holds the current story; the dots jump to one.
 * With reduced motion nothing moves on its own: the dots and arrows change the story.
 */
export function StoryReel({ stories, labels }: { stories: ReelStory[]; labels: { read: string; previous: string; next: string; show: string } }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (held || still || stories.length < 2) return;
    timers.current = [
      window.setTimeout(() => setLeaving(true), SHOW_MS),
      window.setTimeout(() => {
        setLeaving(false);
        setIndex((current) => (current + 1) % stories.length);
      }, SHOW_MS + OUT_MS),
    ];
    return () => timers.current.forEach((timer) => window.clearTimeout(timer));
  }, [index, held, still, stories.length]);

  const go = (next: number) => {
    setLeaving(false);
    setIndex((next + stories.length) % stories.length);
  };

  return (
    <div
      className="flex flex-col gap-4"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      <div className="story-reel grid overflow-hidden rounded-card border border-border bg-card shadow-sm">
        {stories.map((story, position) => {
          const state = position !== index ? 'hidden' : leaving ? 'out' : 'in';
          return (
            <article
              key={story.id}
              data-state={state}
              aria-hidden={state === 'hidden' || undefined}
              className="story-slide grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
            >
              <div className="story-photo relative overflow-hidden">
                <StoryScene category={story.category} className="aspect-[16/10] size-full" />
                <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[0.7rem] font-semibold text-white backdrop-blur-sm">
                  <Icon name="eye-off" size={13} />
                  {labels.show}
                </span>
              </div>
              <div className="flex flex-col justify-center gap-4 p-6 md:p-8">
                <p className="story-step text-xs font-semibold text-muted-foreground" style={{ ['--i' as string]: 1 }}>
                  {story.meta}
                </p>
                <h3 className="story-step font-display text-2xl font-bold leading-snug md:text-[1.7rem]" style={{ ['--i' as string]: 1 }}>
                  {story.title}
                </h3>
                <p className="story-step line-clamp-5 leading-relaxed text-muted-foreground" style={{ ['--i' as string]: 2 }}>
                  {story.story}
                </p>
                {story.outcome !== story.story && (
                  <p className="story-step inline-flex items-start gap-2 font-semibold text-success" style={{ ['--i' as string]: 3 }}>
                    <Icon name="check" size={18} className="mt-0.5 shrink-0" />
                    {story.outcome}
                  </p>
                )}
                <div className="story-step flex flex-col gap-2 border-t border-border pt-4 text-sm" style={{ ['--i' as string]: 4 }}>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold text-primary">{story.raised}</span>
                    <span className="text-muted-foreground">{story.donors}</span>
                    <span className="text-muted-foreground">· {story.closed}</span>
                  </p>
                  {story.confirmed && (
                    <p className="inline-flex items-start gap-1.5 self-start rounded-control bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-soft-foreground">
                      <Icon name="shield-check" size={15} className="mt-px shrink-0" />
                      {story.confirmed}
                    </p>
                  )}
                  <Link
                    href={story.href}
                    tabIndex={state === 'hidden' ? -1 : undefined}
                    className="inline-flex items-center gap-1.5 self-start font-semibold text-primary hover:underline"
                  >
                    {labels.read}
                    <Icon name="arrow-forward" size={16} />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {stories.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={labels.previous}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <Icon name="back" size={18} />
          </button>
          <ol className="flex items-center gap-2">
            {stories.map((story, position) => (
              <li key={story.id}>
                <button
                  type="button"
                  onClick={() => go(position)}
                  aria-label={story.title}
                  aria-current={position === index || undefined}
                  className={cn('h-1.5 rounded-full transition-all', position === index ? 'w-6 bg-highlight' : 'w-1.5 bg-border hover:bg-muted-foreground')}
                />
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={labels.next}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <Icon name="forward" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
