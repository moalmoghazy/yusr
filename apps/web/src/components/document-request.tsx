'use client';

import type { Locale } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState, useId } from 'react';
import { requestDocuments, type DocumentRequestState } from '@/lib/document-requests';

const DIALOG_ID = 'request-documents';

const control =
  'h-11 w-full rounded-control border border-input bg-card px-3 outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-[invalid]:border-destructive';

const open = () => (document.getElementById(DIALOG_ID) as HTMLDialogElement | null)?.showModal();
const close = () => (document.getElementById(DIALOG_ID) as HTMLDialogElement | null)?.close();

/** «اطلب الاطلاع» beside a document's «محجوب» badge: opens the request form. */
export function RequestDocumentsButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={open} aria-haspopup="dialog" className={buttonClasses({ variant: 'outline', size: 'sm', className: 'h-7 px-2.5 text-xs' })}>
      <Icon name="eye" size={14} />
      {label}
    </button>
  );
}

/**
 * The request form, once per case page: name, WhatsApp number and agreement to view only. The team sends
 * the documents to that number as view-once images; the number never reaches a public page.
 */
export function DocumentRequestDialog({ locale, slug }: { locale: Locale; slug: string }) {
  const { t } = textFor(locale);
  const ids = useId();
  const [state, action, pending] = useActionState<DocumentRequestState, FormData>(requestDocuments, { status: 'idle' });
  const invalid = (field: string) => (state.status === 'error' && state.fields.includes(field)) || undefined;

  return (
    <dialog
      id={DIALOG_ID}
      aria-labelledby={`${ids}-title`}
      className="m-auto outline-none w-[min(34rem,calc(100vw-2rem))] rounded-card border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${ids}-title`} className="font-display text-xl font-bold">
            {state.status === 'sent' ? t('case.requestDocs.sentTitle') : t('case.requestDocs.title')}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t('case.requestDocs.close')}
            className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'size-9 shrink-0 px-0' })}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {state.status === 'sent' ? (
          <div role="status" className="flex flex-col items-center gap-3 py-2 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
              <Icon name="check" size={28} strokeWidth={2.2} />
            </span>
            <p className="max-w-sm text-muted-foreground">{t('case.requestDocs.sentBody')}</p>
            <button type="button" onClick={close} className={buttonClasses({ variant: 'outline' })}>
              {t('case.requestDocs.close')}
            </button>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t('case.requestDocs.body')}</p>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="slug" value={slug} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-name`} className="text-sm font-semibold">
                {t('case.requestDocs.name')}
              </label>
              <input
                id={`${ids}-name`}
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                aria-invalid={invalid('name')}
                className={control}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-whatsapp`} className="text-sm font-semibold">
                {t('case.requestDocs.whatsapp')}
              </label>
              <input
                id={`${ids}-whatsapp`}
                name="whatsapp"
                type="tel"
                required
                autoComplete="tel"
                inputMode="tel"
                dir="ltr"
                placeholder="01xxxxxxxxx"
                aria-invalid={invalid('whatsapp')}
                aria-describedby={`${ids}-whatsapp-hint`}
                className={cn(control, 'text-start')}
              />
              <p id={`${ids}-whatsapp-hint`} className="text-xs text-muted-foreground">
                {t('case.requestDocs.whatsappHint')}
              </p>
            </div>
            <p className="flex items-start gap-2 rounded-control bg-warning-soft p-3 text-sm text-warning-soft-foreground">
              <Icon name="eye-off" size={18} className="mt-0.5 shrink-0" />
              {t('case.requestDocs.viewOnly')}
            </p>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="viewOnly" required aria-invalid={invalid('viewOnly')} className="mt-0.5 size-4 shrink-0 accent-primary" />
              {t('case.requestDocs.agree')}
            </label>
            {state.status === 'error' && (
              <p role="alert" className="flex items-start gap-2 rounded-control bg-destructive-soft p-3 text-sm text-destructive-soft-foreground">
                <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
                {t(`errors.${state.code}`)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending} className={buttonClasses({})}>
                <Icon name="send" size={16} />
                {t('case.requestDocs.send')}
              </button>
              <button type="button" onClick={close} className={buttonClasses({ variant: 'ghost' })}>
                {t('case.requestDocs.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
