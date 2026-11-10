import { regionByCode, type CaseCategory, type Locale, type SuccessStory } from '@yusr/core';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn';
import { Icon } from './icon';
import { StoryScene } from './story-scene';
import { textFor } from './text';

/** One «قصص نجاح» story, already worded for the reader. */
export interface StorySlideData {
  category: CaseCategory;
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
  /** A real photo staff uploaded (faces blurred), or null for the illustrated scene. */
  photo: string | null;
  /** Who gave, each name once (anonymous gifts already named «فاعل خير»). */
  contributors: string[];
  /** «و٢٣ متبرعًا آخر» when more gave than are named. */
  others: string | null;
}

export interface StorySlideLabels {
  /** Under a real photo: «الوجوه مموّهة حفاظًا على الخصوصية». */
  show: string;
  /** Under the drawing: «رسم تعبيري». */
  illustrated: string;
  contributors: string;
  noContributors: string;
}

/** The grid one story lays out on: photo, story, then who gave (under both until wide screens). */
export const STORY_SLIDE_GRID =
  'grid grid-cols-1 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.1fr)_minmax(0,0.65fr)]';

const step = (i: number): CSSProperties => ({ ['--i' as string]: i });

/**
 * The inside of one «قصص نجاح» story: the website's reel shows them one at a time (its `story-photo`
 * and `story-step` classes carry the animation), and the hub's «قصص النجاح» page previews one live
 * while staff edit it. Put it in an element with STORY_SLIDE_GRID. `link` is «اقرأ القصة كاملة».
 */
export function StorySlide({ data, labels, link, className }: { data: StorySlideData; labels: StorySlideLabels; link?: ReactNode; className?: string }) {
  return (
    <>
      <div className={cn('story-photo relative min-h-56 overflow-hidden bg-muted', className)}>
        {data.photo ? (
          <img src={data.photo} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        ) : (
          <StoryScene category={data.category} className="absolute inset-0 size-full" />
        )}
        {/* The photo fades into the story beside it (below it on a phone). */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent from-55% to-card md:from-45% md:ltr:bg-linear-to-r md:rtl:bg-linear-to-l"
        />
        <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[0.7rem] font-semibold text-white backdrop-blur-sm">
          <Icon name="eye-off" size={13} />
          {data.photo ? labels.show : labels.illustrated}
        </span>
      </div>
      <div className="flex flex-col justify-center gap-4 p-6 md:p-8">
        <p className="story-step text-xs font-semibold text-muted-foreground" style={step(1)}>
          {data.meta}
        </p>
        <h3 className="story-step font-display text-2xl font-bold leading-snug md:text-[1.7rem]" style={step(1)} dir="auto">
          {data.title}
        </h3>
        <p className="story-step line-clamp-5 whitespace-pre-line leading-relaxed text-muted-foreground" style={step(2)} dir="auto">
          {data.story}
        </p>
        {data.outcome !== data.story && (
          <p className="story-step inline-flex items-start gap-2 font-semibold text-success" style={step(3)} dir="auto">
            <Icon name="check" size={18} className="mt-0.5 shrink-0" />
            {data.outcome}
          </p>
        )}
        <div className="story-step flex flex-col gap-2 border-t border-border pt-4 text-sm" style={step(4)}>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold text-primary">{data.raised}</span>
            <span className="text-muted-foreground">{data.donors}</span>
            <span className="text-muted-foreground">· {data.closed}</span>
          </p>
          {data.confirmed && (
            <p className="inline-flex items-start gap-1.5 self-start rounded-control bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-soft-foreground">
              <Icon name="shield-check" size={15} className="mt-px shrink-0" />
              {data.confirmed}
            </p>
          )}
          {link}
        </div>
      </div>
      <aside
        aria-label={labels.contributors}
        className="story-step flex flex-col gap-3 border-t border-border bg-muted/40 p-6 md:col-span-2 xl:col-span-1 xl:border-s xl:border-t-0"
        style={step(5)}
      >
        <h4 className="inline-flex items-center gap-2 text-sm font-bold">
          <Icon name="heart" size={16} className="text-highlight" />
          {labels.contributors}
        </h4>
        {data.contributors.length > 0 ? (
          <ul className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto md:max-h-none xl:max-h-80">
            {data.contributors.map((name, position) => (
              <li key={`${name}-${position}`} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold" dir="auto">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{labels.noContributors}</p>
        )}
        {data.others && <p className="text-xs text-muted-foreground">{data.others}</p>}
      </aside>
    </>
  );
}

/** A story as the reader sees it, in one locale; `photo` is the URL of its real photo (null: the drawing). */
export function storySlideData(story: SuccessStory, locale: Locale, photo: string | null): StorySlideData {
  const { t, f, l } = textFor(locale);
  const region = regionByCode(story.region);
  // An API from before photos and contributors: no names.
  const named = story.contributors ?? [];
  return {
    category: story.category,
    meta: `${t(`categories.${story.category}`)} · ${region ? l(region.name) : story.region}`,
    title: l(story.title),
    // An API from before stories carried their text answers with the summary only.
    story: l(story.story ?? story.summary),
    outcome: l(story.summary),
    raised: t('landing.stories.raised', { amount: f.money(story.raisedMinor, story.currency) }),
    donors: t('units.donors', { count: story.donorsCount }),
    closed: t('landing.stories.closedOn', { date: f.date(story.closedAt, 'medium') }),
    confirmed: story.confirmedAt ? t('landing.stories.confirmed', { date: f.date(story.confirmedAt, 'medium') }) : null,
    photo,
    // Each name once (a donor who gave twice, or many anonymous gifts, shows a single chip).
    contributors: [...new Set(named.map((name) => name ?? t('landing.stories.anonymous')))],
    others: story.donorsCount > named.length ? t('landing.stories.others', { count: story.donorsCount - named.length }) : null,
  };
}

/** The labels StorySlide needs, in one locale. */
export function storySlideLabels(locale: Locale): StorySlideLabels {
  const { t } = textFor(locale);
  return {
    show: t('landing.stories.blurred'),
    illustrated: t('landing.stories.illustrated'),
    contributors: t('landing.stories.contributors'),
    noContributors: t('landing.stories.noContributors'),
  };
}
