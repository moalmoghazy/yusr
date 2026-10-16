'use client';

import { Icon, type IconName } from '@yusr/ui';
import { useState } from 'react';
import { THEME_COOKIE, type ThemePreference } from '@/lib/i18n';

const NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
const ICON: Record<ThemePreference, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

/**
 * Cycles system → light → dark. The choice lives in a cookie so the server renders the right
 * class on <html> (no flash of the wrong theme); "system" follows the OS via the tokens' media query.
 */
export function ThemeSwitch({ initial, labels }: { initial: ThemePreference; labels: { title: string } & Record<ThemePreference, string> }) {
  const [theme, setTheme] = useState(initial);
  const next = NEXT[theme];
  return (
    <button
      type="button"
      className="grid size-9 place-items-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={`${labels.title}: ${labels[theme]}`}
      title={`${labels.title}: ${labels[theme]}`}
      onClick={() => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        if (next !== 'system') root.classList.add(next);
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        setTheme(next);
      }}
    >
      <Icon name={ICON[theme]} size={18} />
    </button>
  );
}
