'use client';

import { cn, Icon, STORY_SLIDE_GRID, StorySlide, type StorySlideData, type StorySlideLabels } from '@yusr/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export interface ReelStory extends StorySlideData {
  id: string;
  href: string;
}

interface ReelLabels extends StorySlideLabels {
  read: string;
  previous: string;
  next: string;
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
export function StoryReel({ stories, labels }: { stories: ReelStory[]; labels: ReelLabels }) {
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
            <article key={story.id} data-state={state} aria-hidden={state === 'hidden' || undefined} className={cn('story-slide', STORY_SLIDE_GRID)}>
              <StorySlide
                data={story}
                labels={labels}
                link={
                  <Link
                    href={story.href}
                    tabIndex={state === 'hidden' ? -1 : undefined}
                    className="inline-flex items-center gap-1.5 self-start font-semibold text-primary hover:underline"
                  >
                    {labels.read}
                    <Icon name="arrow-forward" size={16} />
                  </Link>
                }
              />
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
