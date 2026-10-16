'use client';

import { cn, Icon, type IconName } from '@yusr/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface HubNavItem {
  href: string;
  label: string;
  icon: IconName;
}

export function HubNav({ items, label }: { items: HubNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((item) => {
        const current = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
              current ? 'bg-primary-soft text-primary-soft-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
