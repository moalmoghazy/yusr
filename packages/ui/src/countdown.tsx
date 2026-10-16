'use client';

import { computeCountdown, type Locale } from '@yusr/core';
import { useEffect, useState } from 'react';
import { cn } from './cn';
import { Icon } from './icon';
import { textFor } from './text';

/** Full class names per urgency — Tailwind only generates what it can read in the source. */
const LEVEL = {
  critical: 'bg-destructive text-destructive-foreground',
  soon: 'bg-warning-soft text-warning-soft-foreground',
  normal: 'bg-card text-foreground',
} as const;

export interface CountdownBadgeProps {
  /** ISO timestamp; nothing renders without one. */
  deadline: string | null;
  locale: Locale;
  /**
   * The server's clock when the page was rendered. The first client render uses it too, so
   * hydration matches the HTML; the badge then switches to the device clock.
   */
  initialNow?: number;
  className?: string;
}

/**
 * The live deadline chip on urgent cases: «باقٍ ٣ أيام», then hh:mm:ss in the last day.
 * Ticks once a minute while days remain and once a second in the final day, and stops at zero.
 * The only client component in the case card — everything around it renders on the server.
 */
export function CountdownBadge({ deadline, locale, initialNow, className }: CountdownBadgeProps) {
  const [now, setNow] = useState(() => initialNow ?? Date.now());
  const countdown = computeCountdown(deadline, now);
  const running = countdown !== null && !countdown.expired;
  const everySecond = running && countdown.days === 0;

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everySecond ? 1_000 : 60_000);
    return () => clearInterval(timer);
  }, [running, everySecond]);

  if (!countdown) return null;
  const { t, f } = textFor(locale);
  const chip = 'inline-flex h-[27px] items-center gap-1.5 rounded-full px-2.5 text-[0.78rem] font-bold shadow-sm';

  if (countdown.expired) {
    return (
      <span className={cn(chip, 'bg-card text-muted-foreground', className)}>
        <Icon name="clock" size={14} strokeWidth={2} />
        {t('case.ended')}
      </span>
    );
  }

  const pad = (value: number) => f.number(value, { minimumIntegerDigits: 2, useGrouping: false });
  const remaining =
    countdown.days > 0 ? t('units.daysLeft', { count: countdown.days }) : `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`;

  return (
    <span role="timer" aria-label={`${t('a11y.countdown')}: ${remaining}`} className={cn(chip, LEVEL[countdown.level], className)}>
      <span aria-hidden className="size-[7px] rounded-full bg-current motion-safe:animate-pulse" />
      <Icon name="clock" size={14} strokeWidth={2} />
      <span className="tabular-nums" suppressHydrationWarning>
        {remaining}
      </span>
    </span>
  );
}
