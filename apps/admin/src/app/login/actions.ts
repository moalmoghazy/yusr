'use server';

import { isStaff, toE164, type AuthSession } from '@yusr/core';
import { phoneSchema } from '@yusr/core/schemas';
import { ApiError, createHttpAuthClient } from '@yusr/sdk';
import { textFor } from '@yusr/ui';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiEdge, apiTimeoutMs, apiUrl } from '@/lib/env';
import { hubLocale } from '@/lib/i18n';
import { safeNext } from '@/lib/safe-next';
import { sessionCookies } from '@/lib/tokens';

export type LoginState = { step: 'phone'; error?: string } | { step: 'code'; phone: string; resendIn: number; demoCode?: string; error?: string };

/**
 * Staff sign-in in two steps: a code by SMS, then that code with the authenticator-app code.
 * A session without the second factor, or for an account with no team role, is ended on the spot.
 */
export async function login(previous: LoginState, form: FormData): Promise<LoginState> {
  const locale = await hubLocale();
  const { t } = textFor(locale);
  const edge = apiEdge(await headers());
  const auth = createHttpAuthClient({ baseUrl: apiUrl(), timeoutMs: apiTimeoutMs(), locale, ...(edge ? { edge } : {}) });
  const intent = form.get('intent');
  const failure = (error: unknown) => (error instanceof ApiError ? t(`errors.${error.code}`) : t('errors.generic'));

  if (intent === 'change') return { step: 'phone' };

  if (intent === 'send' || intent === 'resend') {
    const raw = intent === 'resend' && previous.step === 'code' ? previous.phone : String(form.get('phone') ?? '');
    const phone = toE164(raw, 'EG');
    if (!phone || !phoneSchema.safeParse(phone).success) return { step: 'phone', error: t('errors.VALIDATION_FAILED') };
    try {
      const challenge = await auth.requestOtp(phone, locale);
      return { step: 'code', phone, resendIn: challenge.resendInSeconds, ...(challenge.demoCode ? { demoCode: challenge.demoCode } : {}) };
    } catch (error) {
      return previous.step === 'code' ? { ...previous, error: failure(error) } : { step: 'phone', error: failure(error) };
    }
  }

  if (previous.step !== 'code') return { step: 'phone' };
  let session: AuthSession;
  try {
    session = await auth.verifyOtp({
      phone: previous.phone,
      code: String(form.get('code') ?? '').trim(),
      totp: String(form.get('totp') ?? '').trim() || null,
      locale,
    });
  } catch (error) {
    return { ...previous, resendIn: 0, error: failure(error) };
  }
  if (!isStaff(session.user.roles) || !session.user.mfa) {
    await auth.logout(session.refreshToken).catch(() => undefined);
    return { ...previous, resendIn: 0, error: t('auth.staffOnly') };
  }
  const jar = await cookies();
  for (const write of sessionCookies(session)) jar.set(write.name, write.value, write.options);
  redirect(safeNext(form.get('next')));
}
