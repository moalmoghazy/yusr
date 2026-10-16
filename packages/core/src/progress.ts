export type ProgressTone = 'start' | 'building' | 'close' | 'funded';

export interface Progress {
  /** Exact completion ratio clamped to [0, 1]. */
  ratio: number;
  /**
   * Whole-number percentage for display. Two honesty rules:
   * a case with donations never reads 0%, and a case short of its goal never reads 100%.
   */
  percent: number;
  remainingMinor: number;
  isFunded: boolean;
  overfundedMinor: number;
  tone: ProgressTone;
}

export function computeProgress(raisedMinor: number, goalMinor: number): Progress {
  if (!Number.isFinite(goalMinor) || goalMinor <= 0) {
    throw new RangeError(`goalMinor must be a positive number, received ${goalMinor}`);
  }
  const raised = Math.max(0, Number.isFinite(raisedMinor) ? raisedMinor : 0);
  const isFunded = raised >= goalMinor;
  const ratio = Math.min(1, raised / goalMinor);

  let percent = Math.floor(ratio * 100);
  if (!isFunded && percent >= 100) percent = 99;
  if (raised > 0 && percent === 0) percent = 1;
  if (isFunded) percent = 100;

  const tone: ProgressTone = isFunded ? 'funded' : ratio >= 0.8 ? 'close' : ratio >= 0.25 ? 'building' : 'start';

  return {
    ratio,
    percent,
    remainingMinor: Math.max(0, goalMinor - raised),
    isFunded,
    overfundedMinor: Math.max(0, raised - goalMinor),
    tone,
  };
}

export type UrgencyLevel = 'critical' | 'soon' | 'normal';

export interface Countdown {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
  level: UrgencyLevel;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Live countdown for urgent cases. Returns null when the case has no deadline. */
export function computeCountdown(deadline: string | Date | null | undefined, now: number = Date.now()): Countdown | null {
  if (!deadline) return null;
  const end = typeof deadline === 'string' ? Date.parse(deadline) : deadline.getTime();
  if (Number.isNaN(end)) return null;
  const totalMs = Math.max(0, end - now);
  const expired = totalMs === 0;
  const days = Math.floor(totalMs / DAY);
  const hours = Math.floor((totalMs % DAY) / HOUR);
  const minutes = Math.floor((totalMs % HOUR) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const level: UrgencyLevel = totalMs < 2 * DAY ? 'critical' : totalMs < 7 * DAY ? 'soon' : 'normal';
  return { totalMs, days, hours, minutes, seconds, expired, level };
}
