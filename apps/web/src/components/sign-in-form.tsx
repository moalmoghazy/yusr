'use client';

import type { Locale } from '@yusr/core';
import { buttonClasses, Icon, textFor } from '@yusr/ui';
import { useActionState, useEffect, useState } from 'react';
import { signIn, type SignInState } from '@/lib/account';

const input =
  'h-12 w-full rounded-control border border-input bg-card px-3 text-lg outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40';

/** Phone, then the code sent to it. Built like the hub's sign-in, without the authenticator step. */
export function SignInForm({ locale }: { locale: Locale }) {
  const { t, f } = textFor(locale);
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { step: 'phone' });
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (state.step !== 'code' || state.resendIn <= 0) return;
    setWait(state.resendIn);
    const timer = setInterval(() => setWait((value) => (value <= 1 ? (clearInterval(timer), 0) : value - 1)), 1000);
    return () => clearInterval(timer);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      {state.step === 'phone' ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('auth.phone')}</span>
            <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" dir="ltr" placeholder="01xxxxxxxxx" className={input} />
          </label>
          <button type="submit" name="intent" value="send" disabled={pending} className={buttonClasses({ size: 'lg', block: true })}>
            <Icon name="send" size={18} />
            {t('auth.sendCode')}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t('auth.codeSent', { phone: '' })}
            <bdi dir="ltr" className="font-mono text-foreground">
              {state.phone}
            </bdi>
          </p>
          {state.demoCode && (
            <p role="note" className="rounded-control bg-warning-soft p-3 text-sm text-warning-soft-foreground">
              {t('auth.demoCode')}{' '}
              <bdi dir="ltr" className="font-mono text-base font-bold">
                {state.demoCode}
              </bdi>
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('auth.code')}</span>
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              dir="ltr"
              className={`${input} text-center tracking-[0.3em] tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('account.name')}</span>
            <input name="name" autoComplete="name" maxLength={80} className={input} />
            <span className="text-xs text-muted-foreground">{t('account.nameHint')}</span>
          </label>
          <button type="submit" name="intent" value="verify" disabled={pending} className={buttonClasses({ size: 'lg', block: true })}>
            <Icon name="lock" size={18} />
            {t('auth.verify')}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button type="submit" name="intent" value="change" formNoValidate className="font-semibold text-primary hover:underline">
              {t('auth.changePhone')}
            </button>
            <button
              type="submit"
              name="intent"
              value="resend"
              formNoValidate
              disabled={wait > 0 || pending}
              className="font-semibold text-primary enabled:hover:underline disabled:text-muted-foreground"
            >
              {wait > 0 ? t('auth.resendIn', { seconds: f.number(wait) }) : t('auth.sendCode')}
            </button>
          </div>
        </>
      )}
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-destructive-soft p-3 text-sm text-destructive-soft-foreground">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
          {t(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}
