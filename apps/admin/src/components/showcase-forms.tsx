'use client';

import { PARTNER_LOGO_MAX_BYTES, PARTNER_LOGO_TYPES, type Locale, type PartnerLogoType } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { startTransition, useActionState, useRef, useState } from 'react';
import { removePartnerLogo, renamePartner, setPartnerLogo, setPartnerShowcase } from '@/app/(hub)/showcase/actions';
import type { ActionResult } from '@/lib/session';

const control =
  'h-9 w-full rounded-control border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40';

/** The longest side a picture logo keeps; the row shows it at 56 px, so this is sharp on any screen. */
const LOGO_SIDE = 256;

function Result({ result }: { result: ActionResult }) {
  if (!result) return null;
  return (
    <p role="status" className={cn('text-xs font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
      {result.message}
    </p>
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** SVG goes up as drawn (the API refuses scripts and links in it); pictures are shrunk to WebP first. */
async function prepareLogo(file: File): Promise<{ contentType: PartnerLogoType; bytes: Uint8Array }> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return { contentType: 'image/svg+xml', bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  if (!blob) throw new Error('encode');
  // Browsers without WebP encoding hand back PNG.
  const contentType = (PARTNER_LOGO_TYPES as readonly string[]).includes(blob.type) ? (blob.type as PartnerLogoType) : 'image/png';
  return { contentType, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

/** Picks a file and saves it at once; the row on the website changes from the next visit. */
export function LogoUpload({ locale, partnerId, hasLogo }: { locale: Locale; partnerId: string; hasLogo: boolean }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(setPartnerLogo, null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = pending || reading;
  return (
    <div className="flex flex-col items-start gap-1">
      <input
        ref={input}
        type="file"
        accept="image/svg+xml,image/png,image/jpeg,image/webp,.svg"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setProblem(null);
          setReading(true);
          try {
            const logo = await prepareLogo(file);
            if (logo.bytes.length > PARTNER_LOGO_MAX_BYTES) {
              setProblem(t('admin.showcase.logoTooBig'));
              return;
            }
            const form = new FormData();
            form.set('partnerId', partnerId);
            form.set('contentType', logo.contentType);
            form.set('dataBase64', toBase64(logo.bytes));
            startTransition(() => action(form));
          } catch {
            setProblem(t('admin.showcase.logoUnreadable'));
          } finally {
            setReading(false);
          }
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClasses({ variant: 'soft', size: 'sm' })}>
        <Icon name={busy ? 'refresh' : 'upload'} size={15} className={cn(busy && 'animate-spin')} />
        {hasLogo ? t('admin.showcase.replace') : t('admin.showcase.upload')}
      </button>
      {problem ? (
        <p role="status" className="text-xs font-semibold text-destructive">
          {problem}
        </p>
      ) : (
        <Result result={result} />
      )}
    </div>
  );
}

export function RemoveLogoForm({ locale, partnerId }: { locale: Locale; partnerId: string }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(removePartnerLogo, null);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t('admin.showcase.removeConfirm'))) event.preventDefault();
      }}
      className="flex flex-col items-start gap-1"
    >
      <input type="hidden" name="partnerId" value={partnerId} />
      <button type="submit" disabled={pending} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
        <Icon name="x" size={15} />
        {t('admin.showcase.remove')}
      </button>
      <Result result={result} />
    </form>
  );
}

/** A switch that saves when pressed: shown on the site, or the «جديد» badge. */
export function ShowcaseSwitch({
  locale,
  partnerId,
  field,
  on,
  disabled,
}: {
  locale: Locale;
  partnerId: string;
  field: 'showcased' | 'newBadge';
  on: boolean;
  disabled?: boolean;
}) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(setPartnerShowcase, null);
  const label = field === 'showcased' ? t('admin.showcase.shown') : t('admin.showcase.newBadge');
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={on ? 'off' : 'on'} />
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        disabled={pending || disabled}
        className="group inline-flex items-center gap-2.5 rounded-control text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60"
      >
        <span
          aria-hidden
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
            on ? 'border-primary bg-primary' : 'border-border-strong bg-muted',
          )}
        >
          <span
            className={cn(
              'absolute size-[1.15rem] rounded-full bg-card shadow transition-[inset-inline-start]',
              on ? 'start-[calc(100%-1.3rem)]' : 'start-[0.12rem]',
            )}
          />
        </span>
        {label}
      </button>
      <Result result={result} />
    </form>
  );
}

/** The name and registration number under the logo. */
export function RenamePartnerForm({
  locale,
  partnerId,
  name,
  registrationNumber,
}: {
  locale: Locale;
  partnerId: string;
  name: string;
  registrationNumber: string;
}) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(renamePartner, null);
  return (
    <form action={action} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="partnerId" value={partnerId} />
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold text-muted-foreground">{t('admin.partners.fields.name')}</span>
        <input name="name" required minLength={3} maxLength={120} dir="auto" defaultValue={name} className={control} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold text-muted-foreground">{t('admin.partners.fields.registrationNumber')}</span>
        <input name="registrationNumber" required maxLength={40} dir="ltr" defaultValue={registrationNumber} className={cn(control, 'text-start font-mono')} />
      </label>
      <button type="submit" disabled={pending} className={buttonClasses({ variant: 'outline', size: 'sm', className: 'h-9' })}>
        <Icon name="check" size={15} />
        {t('admin.showcase.save')}
      </button>
      <div className="sm:col-span-3">
        <Result result={result} />
      </div>
    </form>
  );
}
