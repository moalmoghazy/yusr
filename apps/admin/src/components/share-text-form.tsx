'use client';

import type { CaseCategory, Locale, Localized } from '@yusr/core';
import { caseShareMessage } from '@yusr/i18n';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState, useState } from 'react';
import { saveShareText } from '@/app/(hub)/cases/actions';
import type { ActionResult } from '@/lib/session';

const field = 'rounded-control border border-input bg-card p-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40';

/**
 * «نص المشاركة» for one case: the line that goes out when the case is shared (and shows under its
 * title in link previews), in Arabic and English, with a live preview of the whole message as donors
 * will see it — Yusr's promise included. Clearing both falls back to the line composed from the title.
 */
export function ShareTextForm({
  locale,
  caseId,
  title,
  category,
  shareText,
}: {
  locale: Locale;
  caseId: string;
  title: Localized;
  category: CaseCategory;
  shareText: Localized | null;
}) {
  const { t } = textFor(locale);
  const ar = textFor('ar').t;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ ar: shareText?.ar ?? '', en: shareText?.en ?? '' });
  const [state, save, saving] = useActionState<ActionResult, FormData>(saveShareText, null);
  // The preview is the Arabic message, the one most donors receive.
  const preview = caseShareMessage(ar, 'ar', { title, category, shareText: draft.ar.trim() ? draft : null });

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
        <Icon name="share" size={15} className={cn(shareText && 'text-primary')} />
        {t('admin.cases.shareText')}
        {shareText && <Icon name="check" size={13} className="text-success" />}
      </button>
      {open && (
        <form action={save} className="flex w-full max-w-md flex-col gap-2 rounded-control border border-border bg-muted/50 p-3">
          <input type="hidden" name="caseId" value={caseId} />
          <p className="text-xs leading-relaxed text-muted-foreground">{t('admin.cases.shareTextHint')}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t('admin.cases.shareTextAr')}</span>
            <textarea
              name="ar"
              dir="rtl"
              lang="ar"
              rows={3}
              maxLength={220}
              value={draft.ar}
              onChange={(event) => setDraft({ ...draft, ar: event.target.value })}
              placeholder={ar('admin.cases.shareTextPlaceholder')}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t('admin.cases.shareTextEn')}</span>
            <textarea
              name="en"
              dir="ltr"
              lang="en"
              rows={2}
              maxLength={220}
              value={draft.en}
              onChange={(event) => setDraft({ ...draft, en: event.target.value })}
              placeholder={textFor('en').t('admin.cases.shareTextPlaceholder')}
              className={field}
            />
          </label>
          <figure className="flex flex-col gap-1 rounded-control border border-dashed border-primary/40 bg-card p-2.5">
            <figcaption className="text-xs font-semibold text-muted-foreground">{t('admin.cases.shareTextPreview')}</figcaption>
            <p dir="rtl" lang="ar" className="text-sm leading-relaxed">
              {preview}
            </p>
          </figure>
          <button type="submit" disabled={saving} className={buttonClasses({ size: 'sm', className: 'self-start' })}>
            {t('admin.cases.shareTextSave')}
          </button>
          {state && (
            <p role="status" className={cn('text-xs font-semibold', state.ok ? 'text-success' : 'text-destructive')}>
              {state.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
