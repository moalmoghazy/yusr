'use client';

import { cn, Icon, STORY_SLIDE_GRID, StorySlide, StoryVideoSlide, type StorySlideData, type StorySlideLabels } from '@yusr/ui';
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
 * «قصص نجاح» told one at a time. A story with a video leads with it across the full width of the page
 * (silent until the sound button is pressed), fading into the story and its contributors below; the next
 * story comes when the video ends. A story without one shows its scene (faces blurred), title and story in
 * a card, for a few seconds. Resting the pointer on it (or focusing inside it) holds the current story;
 * the dots jump to one. With reduced motion nothing moves on its own: the dots and arrows change the story.
 */
export function StoryReel({ stories, labels }: { stories: ReelStory[]; labels: ReelLabels }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);
  const timers = useRef<number[]>([]);
  const current = stories[index];
  const onVideo = Boolean(current?.video);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const advance = () => {
    setLeaving(true);
    timers.current.push(
      window.setTimeout(() => {
        setLeaving(false);
        setIndex((value) => (value + 1) % stories.length);
      }, OUT_MS),
    );
  };

  // A story without a video moves on after a while; one with a video moves on when it ends.
  useEffect(() => {
    if (held || still || stories.length < 2 || onVideo) return;
    timers.current = [window.setTimeout(advance, SHOW_MS)];
    return () => timers.current.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advance only reads setters and the count
  }, [index, held, still, stories.length, onVideo]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const go = (next: number) => {
    setLeaving(false);
    setIndex((next + stories.length) % stories.length);
  };

  const readLink = (story: ReelStory, hidden: boolean) => (
    <Link
      href={story.href}
      tabIndex={hidden ? -1 : undefined}
      className="inline-flex items-center gap-1.5 self-start font-semibold text-primary hover:underline"
    >
      {labels.read}
      <Icon name="arrow-forward" size={16} />
    </Link>
  );

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
      <div className="story-reel grid">
        {stories.map((story, position) => {
          const state = position !== index ? 'hidden' : leaving ? 'out' : 'in';
          const hidden = state === 'hidden';
          return (
            <article key={story.id} data-state={state} aria-hidden={hidden || undefined} className="story-slide">
              {story.video ? (
                <StoryVideoSlide
                  data={{ ...story, video: story.video }}
                  labels={labels}
                  link={readLink(story, hidden)}
                  active={!hidden}
                  loop={stories.length < 2 || still}
                  onEnded={() => {
                    if (!held && !still && stories.length > 1) advance();
                  }}
                  inner="container-page"
                />
              ) : (
                <div className="container-page">
                  <div className={cn('overflow-hidden rounded-card border border-border bg-card shadow-sm', STORY_SLIDE_GRID)}>
                    <StorySlide data={story} labels={labels} link={readLink(story, hidden)} />
                  </div>
                </div>
              )}
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
