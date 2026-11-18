'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import { Icon } from './icon';

/**
 * The video at the top of a «قصص نجاح» story: full width, no player controls, playing silently on its
 * own while its story is showing (browsers only autoplay muted video). One floating button turns the
 * sound on and off. It pauses when its story is not the one showing; `onEnded` lets the reel move on.
 */
export function StoryVideo({
  src,
  active = true,
  loop = false,
  onEnded,
  labels,
  videoClassName,
}: {
  src: string;
  active?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  labels: { unmute: string; mute: string; play?: string };
  /** Applied to the video only (a fade mask, say), not to the sound button. */
  videoClassName?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  /** The phone refused to start it on its own (Low Power Mode, data saver…): offer a tap to play. */
  const [blocked, setBlocked] = useState(false);

  const start = () => {
    const element = video.current;
    if (!element) return;
    // Phones only start a video on their own when it is muted and inline, as attributes, before play().
    element.muted = true;
    element.defaultMuted = true;
    element.setAttribute('muted', '');
    element.setAttribute('playsinline', '');
    element
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  };

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (active) {
      if (element.readyState > 0) element.currentTime = 0;
      start();
    } else {
      element.pause();
      setMuted(true);
    }
  }, [active]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  return (
    <>
      <video
        ref={video}
        src={src}
        muted
        playsInline
        autoPlay={active}
        loop={loop}
        preload={active ? 'auto' : 'metadata'}
        disablePictureInPicture
        controls={false}
        onEnded={onEnded}
        className={cn('absolute inset-0 size-full object-cover', videoClassName)}
      />
      <button
        type="button"
        onClick={() => setMuted((current) => !current)}
        aria-label={muted ? labels.unmute : labels.mute}
        aria-pressed={!muted}
        tabIndex={active ? undefined : -1}
        className="absolute bottom-[24%] end-[4%] z-10 grid size-12 place-items-center rounded-full border border-white/30 bg-black/35 text-white shadow-lg backdrop-blur-md transition hover:bg-black/55 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/60"
      >
        <Icon name={muted ? 'volume-off' : 'volume'} size={22} />
      </button>
      {blocked && active && (
        <button
          type="button"
          onClick={start}
          aria-label={labels.play ?? 'Play'}
          className="absolute inset-0 z-10 m-auto grid size-16 place-items-center rounded-full border border-white/30 bg-black/45 text-white shadow-lg backdrop-blur-md"
        >
          <Icon name="play" size={28} />
        </button>
      )}
    </>
  );
}
