import { CATEGORY_META, regionByCode, type CaseCategory, type Locale, type SuccessStory } from '@yusr/core';
import type { CSSProperties, ReactNode } from 'react';
import { Badge } from './badge';
import { cn } from './cn';
import { Icon } from './icon';
import { StoryScene } from './story-scene';
import { StoryVideo } from './story-video';
import { textFor } from './text';

/** One «قصص نجاح» story, already worded for the reader. */
export interface StorySlideData {
  category: CaseCategory;
  /** «علاج · الإسماعيلية» */
  meta: string;
  /** Shown as tags like the case page's: the category («علاج») and the governorate («الإسماعيلية»). */
  categoryLabel?: string;
  region?: string;
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
  /** A video of the person who was helped (with consent): shown full width above the story. */
  video?: string | null;
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
  /** The video's sound button, and its tap-to-play button when a phone will not start it on its own. */
  unmute?: string;
  mute?: string;
  play?: string;
}

/** The grid one story lays out on: photo, story, then who gave (under both until wide screens). */
export const STORY_SLIDE_GRID =
  'grid grid-cols-1 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.1fr)_minmax(0,0.65fr)]';

const step = (i: number): CSSProperties => ({ ['--i' as string]: i });

/**
 * The wide story's soft edges (`.ys-fade`), along an eased curve so neither edge shows a line.
 * Wide screens: the picture comes in over its top 40% and goes out over its bottom 55%.
 * Phones (a taller, narrower frame): lighter, top 22% and bottom 38%, so the middle of the frame, where a
 * story video keeps its subject, stays clear.
 */
const FADE_STYLE = `
.ys-fade {
  --ys-fade: linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 0.25) 8%, rgb(0 0 0 / 0.7) 16%, #000 22%, #000 62%, rgb(0 0 0 / 0.7) 74%, rgb(0 0 0 / 0.3) 87%, transparent 100%);
  -webkit-mask-image: var(--ys-fade);
  mask-image: var(--ys-fade);
}
/* A video is not masked (Safari on iPhone draws a masked video blank): the page colour is laid over its
   top and bottom along the same curves instead. */
.ys-cover { position: absolute; inset: 0; pointer-events: none;
  background:
    linear-gradient(to bottom, var(--background) 0%, color-mix(in oklab, var(--background) 75%, transparent) 8%, color-mix(in oklab, var(--background) 30%, transparent) 16%, transparent 22%),
    linear-gradient(to top, var(--background) 0%, color-mix(in oklab, var(--background) 70%, transparent) 13%, color-mix(in oklab, var(--background) 30%, transparent) 26%, transparent 38%);
}
@media (min-width: 640px) {
  .ys-cover {
    background:
      linear-gradient(to bottom, var(--background) 0%, color-mix(in oklab, var(--background) 88%, transparent) 9%, color-mix(in oklab, var(--background) 62%, transparent) 20%, color-mix(in oklab, var(--background) 28%, transparent) 31%, transparent 40%),
      linear-gradient(to top, var(--background) 0%, color-mix(in oklab, var(--background) 90%, transparent) 10%, color-mix(in oklab, var(--background) 72%, transparent) 21%, color-mix(in oklab, var(--background) 45%, transparent) 33%, color-mix(in oklab, var(--background) 18%, transparent) 45%, transparent 55%);
  }
}
@media (min-width: 640px) {
  .ys-fade {
    --ys-fade: linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 0.12) 9%, rgb(0 0 0 / 0.38) 20%, rgb(0 0 0 / 0.72) 31%, #000 40%, #000 45%, rgb(0 0 0 / 0.82) 55%, rgb(0 0 0 / 0.55) 67%, rgb(0 0 0 / 0.28) 79%, rgb(0 0 0 / 0.1) 90%, transparent 100%);
  }
}`;

/** The story itself: what it is, its title, the story, how it ended, the numbers and the link. */
function StoryBody({ data, link, className }: { data: StorySlideData; link?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col justify-center gap-4 p-6 md:p-8', className)}>
      {data.categoryLabel ? (
        <div className="story-step flex flex-wrap items-center gap-2" style={step(1)}>
          <Badge tone={CATEGORY_META[data.category].tone} icon={CATEGORY_META[data.category].icon}>
            {data.categoryLabel}
          </Badge>
          {data.region && (
            <Badge tone="slate" icon="map-pin">
              {data.region}
            </Badge>
          )}
        </div>
      ) : (
        <p className="story-step text-xs font-semibold text-muted-foreground" style={step(1)}>
          {data.meta}
        </p>
      )}
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
  );
}

/** «المساهمون في هذه القصة»: a sample of who gave. */
function StoryContributors({ data, labels, className }: { data: StorySlideData; labels: StorySlideLabels; className?: string }) {
  return (
    <aside aria-label={labels.contributors} className={cn('story-step flex flex-col gap-3 p-6', className)} style={step(5)}>
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
  );
}

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
      <StoryBody data={data} link={link} />
      <StoryContributors data={data} labels={labels} className="border-t border-border bg-muted/40 md:col-span-2 xl:col-span-1 xl:border-s xl:border-t-0" />
    </>
  );
}

/**
 * A story told wide: across the full width, the video of the person who was helped (1080p, no player
 * controls, only a floating sound button), or until there is one its photo (faces blurred) or drawing;
 * it fades into the page at its foot, then the story and a sample of its contributors underneath.
 * `inner` wraps the text part (the website keeps it to the page width).
 */
export function StoryVideoSlide({
  data,
  labels,
  link,
  active = true,
  loop = false,
  onEnded,
  inner,
}: {
  data: StorySlideData;
  labels: StorySlideLabels;
  link?: ReactNode;
  active?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  inner?: string;
}) {
  return (
    <div className="flex flex-col">
      <style>{FADE_STYLE}</style>
      {/* A video keeps its whole 16:9 frame everywhere (its titles run across the width); a picture gets a
          taller 4:3 frame on phones. Phones also get the lighter fade, so the middle stays clear. */}
      <div
        className={cn(
          'story-photo relative w-full overflow-hidden',
          data.video ? 'aspect-video sm:max-h-[88vh]' : 'aspect-[4/3] sm:aspect-[16/7] sm:max-h-[70vh] sm:min-h-64',
        )}
      >
        {/* The picture itself fades out at the top and the bottom (a soft mask, so whatever is behind
            shows through: no colour band, no hard edge). The badge and the sound button stay solid. */}
        {data.video ? (
          <StoryVideo
            src={data.video}
            active={active}
            loop={loop}
            onEnded={onEnded}
            labels={{ unmute: labels.unmute ?? 'Sound on', mute: labels.mute ?? 'Sound off', play: labels.play }}
          />
        ) : (
          <div className="ys-fade absolute inset-0">
            {data.photo ? (
              <img src={data.photo} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
            ) : (
              <StoryScene category={data.category} className="absolute inset-0 size-full" />
            )}
          </div>
        )}
        {data.video && <span aria-hidden className="ys-cover" />}
        {!data.video && (
          <span className="absolute top-[18%] start-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[0.7rem] font-semibold text-white backdrop-blur-sm">
            <Icon name="eye-off" size={13} />
            {data.photo ? labels.show : labels.illustrated}
          </span>
        )}
      </div>
      <div className={cn('relative -mt-8 grid grid-cols-1 gap-4 sm:-mt-16 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-2', inner)}>
        <StoryBody data={data} link={link} className="p-0 pb-6 md:p-0 md:pb-6" />
        <StoryContributors data={data} labels={labels} className="h-fit rounded-card border border-border bg-card/80 backdrop-blur-sm" />
      </div>
    </div>
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
    categoryLabel: t(`categories.${story.category}`),
    region: region ? l(region.name) : story.region,
    title: l(story.title),
    // An API from before stories carried their text answers with the summary only.
    story: l(story.story ?? story.summary),
    outcome: l(story.summary),
    raised: t('landing.stories.raised', { amount: f.money(story.raisedMinor, story.currency) }),
    donors: t('units.donors', { count: story.donorsCount }),
    closed: t('landing.stories.closedOn', { date: f.date(story.closedAt, 'medium') }),
    confirmed: story.confirmedAt ? t('landing.stories.confirmed', { date: f.date(story.confirmedAt, 'medium') }) : null,
    photo,
    video: story.videoUrl ?? null,
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
    unmute: t('landing.stories.unmute'),
    mute: t('landing.stories.mute'),
    play: t('landing.stories.play'),
  };
}
