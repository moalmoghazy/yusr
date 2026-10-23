'use client';

import { EGYPT_GOVERNORATES, SAUDI_REGIONS, type Locale, type PartnerStatus } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState, useState } from 'react';
import { createPartner, regeneratePartnerCode, setPartnerStatus, type PartnerActionResult } from '@/app/(hub)/partners/actions';

const control =
  'h-10 w-full rounded-control border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40';

function Result({ result }: { result: PartnerActionResult }) {
  if (!result) return null;
  return (
    <p role="status" className={cn('text-xs font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
      {result.message}
    </p>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-sm', wide && 'sm:col-span-2')}>
      <span className="font-semibold">{label}</span>
      {children}
    </label>
  );
}

/** Adds an approved association (after contract signature); the API issues its «كود يُسر». */
export function CreatePartnerForm({ locale }: { locale: Locale }) {
  const { t, l } = textFor(locale);
  const [result, action, pending] = useActionState<PartnerActionResult, FormData>(createPartner, null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={t('admin.partners.fields.name')} wide>
        <input name="name" required minLength={3} maxLength={120} dir="auto" placeholder={t('admin.partners.fields.namePlaceholder')} className={control} />
      </Field>
      <Field label={t('admin.partners.fields.registrationNumber')}>
        <input name="registrationNumber" required maxLength={40} dir="ltr" inputMode="numeric" className={cn(control, 'text-start font-mono')} />
      </Field>
      <Field label={t('admin.partners.fields.region')}>
        <select name="region" defaultValue="EG-C" className={control}>
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
      <Field label={t('admin.partners.fields.contractSignedOn')}>
        <input name="contractSignedOn" type="date" required max={today} className={control} />
      </Field>
      <Field label={t('admin.partners.fields.contactName')}>
        <input name="contactName" required minLength={2} maxLength={80} dir="auto" autoComplete="off" className={control} />
      </Field>
      <Field label={t('admin.partners.fields.contactPhone')} wide>
        <input name="contactPhone" type="tel" required inputMode="tel" dir="ltr" autoComplete="off" className={cn(control, 'text-start sm:max-w-xs')} />
      </Field>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm sm:col-span-2">
        <input type="checkbox" name="confirm" required className="mt-1 size-4 accent-[var(--primary)]" />
        <span className="font-semibold">{t('admin.partners.confirmContract')}</span>
      </label>
      <div className="flex flex-col items-start gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClasses()}>
          <Icon name="plus" size={17} />
          {t('admin.partners.create')}
        </button>
        {result?.ok && result.code ? <CodeNotice locale={locale} message={result.message} code={result.code} /> : <Result result={result} />}
      </div>
    </form>
  );
}

/** A freshly issued code, prominent and easy to copy, so the moderator can hand it over. */
function CodeNotice({ locale, message, code }: { locale: Locale; message: string; code: string }) {
  const { t } = textFor(locale);
  return (
    <div role="status" className="flex w-full flex-col gap-2 rounded-control border border-success bg-success-soft/50 p-3 text-sm text-success-soft-foreground">
      <p className="font-semibold">{message}</p>
      <CodeChip locale={locale} code={code} large />
      <p className="text-xs">{t('admin.partners.secretNote')}</p>
    </div>
  );
}

/** «كود يُسر» in a monospace chip with a copy button (always left-to-right). */
export function CodeChip({ locale, code, large }: { locale: Locale; code: string; large?: boolean }) {
  const { t } = textFor(locale);
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <code dir="ltr" className={cn('rounded-chip bg-muted px-2 py-0.5 font-mono font-semibold tracking-wider text-foreground', large ? 'text-lg' : 'text-xs')}>
        {code}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1_500);
          });
        }}
        className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'h-7 px-2' })}
        aria-label={`${t('admin.partners.copy')} ${code}`}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
        <span className="sr-only sm:not-sr-only">{copied ? t('admin.partners.copied') : t('admin.partners.copy')}</span>
      </button>
    </span>
  );
}

export function PartnerStatusForm({ locale, partnerId, status }: { locale: Locale; partnerId: string; status: PartnerStatus }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<PartnerActionResult, FormData>(setPartnerStatus, null);
  const next: PartnerStatus = status === 'active' ? 'suspended' : 'active';
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="status" value={next} />
      <button type="submit" disabled={pending} className={buttonClasses({ variant: next === 'suspended' ? 'outline' : 'soft', size: 'sm' })}>
        <Icon name={next === 'suspended' ? 'pause' : 'play'} size={15} />
        {next === 'suspended' ? t('admin.partners.suspend') : t('admin.partners.reactivate')}
      </button>
      <Result result={result} />
    </form>
  );
}

export function RegenerateCodeForm({ locale, partnerId }: { locale: Locale; partnerId: string }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<PartnerActionResult, FormData>(regeneratePartnerCode, null);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t('admin.partners.regenerateConfirm'))) event.preventDefault();
      }}
      className="flex flex-col items-start gap-1"
    >
      <input type="hidden" name="partnerId" value={partnerId} />
      <button type="submit" disabled={pending} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
        <Icon name="refresh" size={15} />
        {t('admin.partners.regenerate')}
      </button>
      {result?.ok && result.code ? <CodeNotice locale={locale} message={result.message} code={result.code} /> : <Result result={result} />}
    </form>
  );
}
