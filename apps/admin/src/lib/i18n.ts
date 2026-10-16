import 'server-only';
import type { Locale } from '@yusr/core';
import { textFor } from '@yusr/ui';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from './tokens';

/** The hub has no locale in its URLs; each staff member's choice is kept in a cookie (Arabic first). */
export async function hubLocale(): Promise<Locale> {
  return (await cookies()).get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'ar';
}

export async function hubText() {
  return textFor(await hubLocale());
}
