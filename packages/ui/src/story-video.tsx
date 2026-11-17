'use client';

import { useEffect, useRef, useState } from 'react';
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
}: {
  src: string;
  active?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  labels: { unmute: string; mute: string };
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (active) {
      element.currentTime = 0;
      void element.play().catch(() => undefined);
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
        loop={loop}
        preload={active ? 'auto' : 'metadata'}
        disablePictureInPicture
        controls={false}
        onEnded={onEnded}
        className="absolute inset-0 size-full object-cover"
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
    </>
  );
}
