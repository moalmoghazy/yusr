'use client';

import { cn } from '@yusr/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** A header link that knows when it is the current page (aria-current + style). */
export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const path = href.split('#')[0] ?? href;
  const current = !href.includes('#') && (exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`));
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'shrink-0 rounded-control px-3 py-2 text-sm font-semibold text-muted-foreground outline-none transition-colors',
        'hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
        current && 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft',
      )}
    >
      {children}
    </Link>
  );
}
