'use client';

import { EGYPT_GOVERNORATES, SAUDI_REGIONS, type Locale } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState, useId, type ReactNode } from 'react';
import { applyAsPartner, type JoinState } from '@/lib/join';

const control =
  'w-full rounded-control border border-input bg-card px-3 outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-[invalid]:border-destructive';

/** «انضم كجمعية شريكة»: who the association is and whom to call. Sent without an account. */
export function JoinForm({ locale }: { locale: Locale }) {
  const { t, l } = textFor(locale);
  const ids = useId();
  const [state, action, pending] = useActionState<JoinState, FormData>(applyAsPartner, { status: 'idle' });

  if (state.status === 'sent') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-card border border-border bg-card p-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
          <Icon name="check" size={28} strokeWidth={2.2} />
        </span>
        <h2 className="font-display text-2xl font-bold">{t('join.sentTitle')}</h2>
        <p className="max-w-md text-muted-foreground">{t('join.sentBody')}</p>
      </div>
    );
  }

  const invalid = (field: string) => state.status === 'error' && state.fields.includes(field);
  return (
    <form action={action} className="flex flex-col gap-5 rounded-card border border-border bg-card p-5 md:p-7" noValidate={false}>
      <input type="hidden" name="locale" value={locale} />
      <Field label={t('join.fields.name')} htmlFor={`${ids}-name`}>
        <input
          id={`${ids}-name`}
          name="name"
          required
          minLength={3}
          maxLength={120}
          aria-invalid={invalid('name') || undefined}
          className={cn(control, 'h-11')}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('join.fields.registrationNumber')} htmlFor={`${ids}-number`} hint={t('join.fields.registrationNumberHint')}>
          <input
            id={`${ids}-number`}
            name="registrationNumber"
            required
            maxLength={40}
            dir="ltr"
            placeholder="1234/2020"
            aria-invalid={invalid('registrationNumber') || undefined}
            className={cn(control, 'h-11 text-start')}
          />
        </Field>
        <Field label={t('join.fields.region')} htmlFor={`${ids}-region`}>
          <select id={`${ids}-region`} name="region" defaultValue="EG-C" className={cn(control, 'h-11')}>
            {(
              [
                ['EG', EGYPT_GOVERNORATES],
                ['SA', SAUDI_REGIONS],
              ] as const
            ).map(([country, regions]) => (
              <optgroup key={country} label={t(`submit.countries.${country}`)}>
                {regions.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {l(entry.name)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('join.fields.contactName')} htmlFor={`${ids}-contact`}>
          <input
            id={`${ids}-contact`}
            name="contactName"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            aria-invalid={invalid('contactName') || undefined}
            className={cn(control, 'h-11')}
          />
        </Field>
        <Field label={t('join.fields.contactPhone')} htmlFor={`${ids}-phone`}>
          <input
            id={`${ids}-phone`}
            name="contactPhone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="01xxxxxxxxx"
            aria-invalid={invalid('contactPhone') || undefined}
            className={cn(control, 'h-11 text-start')}
          />
        </Field>
      </div>
      <Field label={t('join.fields.contactEmail')} htmlFor={`${ids}-email`}>
        <input
          id={`${ids}-email`}
          name="contactEmail"
          type="email"
          autoComplete="email"
          dir="ltr"
          maxLength={200}
          aria-invalid={invalid('contactEmail') || undefined}
          className={cn(control, 'h-11 text-start')}
        />
      </Field>
      <Field label={t('join.fields.message')} htmlFor={`${ids}-message`}>
        <textarea
          id={`${ids}-message`}
          name="message"
          rows={4}
          maxLength={1000}
          placeholder={t('join.fields.messagePlaceholder')}
          className={cn(control, 'py-2.5 leading-relaxed')}
        />
      </Field>
      {state.status === 'error' && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-destructive-soft p-3 text-sm text-destructive-soft-foreground">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
          {t(`errors.${state.code}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClasses({ size: 'lg', className: 'self-start' })}>
        <Icon name="send" size={18} />
        {t('join.send')}
      </button>
    </form>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
