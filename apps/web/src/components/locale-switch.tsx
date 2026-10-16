'use client';

import type { Locale } from '@yusr/core';
import { buttonClasses, Icon } from '@yusr/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALE_COOKIE, otherLocale } from '@/lib/i18n';

/** Same page in the other language; the choice is remembered for the next visit to "/". */
export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const target = otherLocale(locale);
  const href = `/${target}${pathname.replace(/^\/(ar|en)(?=\/|$)/, '')}`;
  return (
    <Link
      href={href}
      hrefLang={target}
      lang={target}
      className={buttonClasses({ variant: 'ghost', size: 'sm' })}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      <Icon name="languages" size={17} />
      {label}
    </Link>
  );
}
