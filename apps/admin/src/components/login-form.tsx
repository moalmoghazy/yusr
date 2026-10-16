'use client';

import type { Locale } from '@yusr/core';
import { buttonClasses, Icon, textFor } from '@yusr/ui';
import { useActionState, useEffect, useState } from 'react';
import { login, type LoginState } from '@/app/login/actions';

const field =
  'h-12 w-full rounded-control border border-input bg-card px-3 text-center text-lg tracking-[0.3em] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40';

export function LoginForm({ locale, next }: { locale: Locale; next: string }) {
  const { t, f } = textFor(locale);
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { step: 'phone' });
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (state.step !== 'code' || state.resendIn <= 0) return;
    setWait(state.resendIn);
    const timer = setInterval(() => setWait((value) => (value <= 1 ? (clearInterval(timer), 0) : value - 1)), 1000);
    return () => clearInterval(timer);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {state.step === 'phone' ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('auth.phone')}</span>
            <input
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="01xxxxxxxxx"
              className="h-12 rounded-control border border-input bg-card px-3 text-lg outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
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
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('auth.code')}</span>
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} dir="ltr" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('auth.totp')}</span>
            <input name="totp" required inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} dir="ltr" className={field} />
            <span className="text-xs text-muted-foreground">{t('auth.totpHint')}</span>
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
          {state.error}
        </p>
      )}
    </form>
  );
}
