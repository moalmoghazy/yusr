import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon } from './icon';
import type { IconName } from './icons';

/** Full class names (Tailwind only generates what it can read in the source). */
const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-primary-soft-foreground',
  gold: 'bg-highlight-soft text-highlight-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  urgent: 'bg-destructive text-destructive-foreground',
  info: 'bg-info-soft text-info-soft-foreground',
  rose: 'bg-tone-rose-soft text-tone-rose-soft-foreground',
  slate: 'bg-tone-slate-soft text-tone-slate-soft-foreground',
  sky: 'bg-tone-sky-soft text-tone-sky-soft-foreground',
  teal: 'bg-tone-teal-soft text-tone-teal-soft-foreground',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = 'neutral', icon, className, children }: { tone?: BadgeTone; icon?: IconName; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-chip px-2.5 py-0.5 text-xs font-semibold leading-6', TONES[tone], className)}>
      {icon && <Icon name={icon} size={14} strokeWidth={2} />}
      {children}
    </span>
  );
}
