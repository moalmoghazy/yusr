import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's stock scales, so the theme's named radii and easings
 * are registered here — otherwise `cn('rounded-card', 'rounded-full')` would keep both.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['control', 'card', 'sheet', 'chip'],
      ease: ['standard', 'emphasized'],
    },
  },
});

/** shadcn/ui's class helper: conditional classes, and later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
