'use server';

import { toE164, type AuthSession, type DomainErrorCode } from '@yusr/core';
import { phoneSchema } from '@yusr/core/schemas';
import { ApiError, createHttpAuthClient } from '@yusr/sdk';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clearedDonorCookies, DONOR_REFRESH_COOKIE, donorSessionCookies } from './donor-session';
import { apiEdge, apiTimeoutMs, apiUrl } from './env';
import { DEFAULT_LOCALE, isLocale } from './i18n';

export type SignInState =
  | { step: 'phone'; error?: DomainErrorCode | 'generic' }
  | { step: 'code'; phone: string; resendIn: number; demoCode?: string; error?: DomainErrorCode | 'generic' };

async function authClient(locale: 'ar' | 'en') {
  const edge = apiEdge(await headers());
  return createHttpAuthClient({ baseUrl: apiUrl(), timeoutMs: apiTimeoutMs(), locale, ...(edge ? { edge } : {}) });
}

const localeOf = (form: FormData) => {
  const value = form.get('locale');
  return typeof value === 'string' && isLocale(value) ? value : DEFAULT_LOCALE;
};

const failure = (error: unknown): DomainErrorCode | 'generic' => (error instanceof ApiError ? error.code : 'generic');

/**
 * A donor's sign-in, in two steps: a code to their mobile, then that code (and, for a new account,
 * the name to greet them by). The same phone number the hub and the app use; no password.
 */
export async function signIn(previous: SignInState, form: FormData): Promise<SignInState> {
  const locale = localeOf(form);
  const intent = form.get('intent');
  if (intent === 'change') return { step: 'phone' };

  const auth = await authClient(locale);
  if (intent === 'send' || intent === 'resend') {
    const raw = intent === 'resend' && previous.step === 'code' ? previous.phone : String(form.get('phone') ?? '');
    const phone = toE164(raw, 'EG');
    if (!phone || !phoneSchema.safeParse(phone).success) return { step: 'phone', error: 'VALIDATION_FAILED' };
    try {
      const challenge = await auth.requestOtp(phone, locale);
      return { step: 'code', phone, resendIn: challenge.resendInSeconds, ...(challenge.demoCode ? { demoCode: challenge.demoCode } : {}) };
    } catch (error) {
      return previous.step === 'code' ? { ...previous, error: failure(error) } : { step: 'phone', error: failure(error) };
    }
  }

  if (previous.step !== 'code') return { step: 'phone' };
  const name = String(form.get('name') ?? '').trim();
  let session: AuthSession;
  try {
    session = await auth.verifyOtp({ phone: previous.phone, code: String(form.get('code') ?? '').trim(), name: name.length >= 2 ? name : null, locale });
  } catch (error) {
    return { ...previous, resendIn: 0, error: failure(error) };
  }
  const jar = await cookies();
  for (const write of donorSessionCookies(session)) jar.set(write.name, write.value, write.options);
  redirect(`/${locale}/account`);
}

/** Ends this login on the API too, so the refresh token cannot be reused. */
export async function signOut(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const jar = await cookies();
  const refreshToken = jar.get(DONOR_REFRESH_COOKIE)?.value;
  if (refreshToken) await (await authClient(locale)).logout(refreshToken).catch(() => undefined);
  for (const write of clearedDonorCookies()) jar.set(write.name, write.value, write.options);
  redirect(`/${locale}`);
}
