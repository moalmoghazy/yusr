'use server';

import { createHttpAuthClient } from '@yusr/sdk';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiEdge, apiTimeoutMs, apiUrl } from '@/lib/env';
import { clearedCookies, LOCALE_COOKIE, REFRESH_COOKIE } from '@/lib/tokens';

/** Ends the login on the server (every device sharing it), then forgets the cookies. */
export async function signOut() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  const edge = apiEdge(await headers());
  if (refreshToken)
    await createHttpAuthClient({ baseUrl: apiUrl(), timeoutMs: apiTimeoutMs(), ...(edge ? { edge } : {}) })
      .logout(refreshToken)
      .catch(() => undefined);
  for (const write of clearedCookies()) jar.set(write.name, write.value, write.options);
  redirect('/login');
}

export async function switchLocale(form: FormData) {
  const locale = form.get('locale') === 'en' ? 'en' : 'ar';
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  revalidatePath('/', 'layout');
}
