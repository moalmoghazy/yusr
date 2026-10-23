import 'server-only';
import { permissionsFor, type Permission } from '@yusr/core';
import { ApiError, createHttpAdminClient, type AdminClient } from '@yusr/sdk';
import { textFor } from '@yusr/ui';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { apiEdge, apiTimeoutMs, apiUrl } from './env';
import { hubLocale } from './i18n';
import { ACCESS_COOKIE, readClaims, type StaffClaims } from './tokens';

export interface Staff {
  token: string;
  claims: StaffClaims;
  permissions: ReadonlySet<Permission>;
}

/** The signed-in staff member (the proxy has already refreshed an expiring token). */
export const currentStaff = cache(async (): Promise<Staff> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const claims = readClaims(token);
  if (!token || !claims) redirect('/login');
  return { token, claims, permissions: permissionsFor(claims.roles) };
});

/** The SDK's admin client acting as that person. Never cached: every screen shows live money. */
export const adminApi = cache(async (): Promise<AdminClient> => {
  const [staff, locale, incoming] = await Promise.all([currentStaff(), hubLocale(), headers()]);
  const edge = apiEdge(incoming);
  return createHttpAdminClient({
    baseUrl: apiUrl(),
    timeoutMs: apiTimeoutMs(),
    ...(edge ? { edge } : {}),
    getAccessToken: () => staff.token,
    locale,
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  });
});

export type ActionResult = { ok: boolean; message: string } | null;

/** Runs a mutation for a server action and turns API errors into the staff member's language. */
export async function attempt(run: () => Promise<unknown>, success: string): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  try {
    await run();
    return { ok: true, message: success };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/login');
      return { ok: false, message: t(`errors.${error.code}`) };
    }
    console.error(error);
    return { ok: false, message: t('errors.generic') };
  }
}
