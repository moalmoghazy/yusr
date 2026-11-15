'use client';

import { OVERSIGHT_VERDICTS, type Locale, type OversightArea, type OversightVerdict } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState, useEffect, useState } from 'react';
import { recordReview } from '@/app/(hub)/oversight/actions';
import type { ActionResult } from '@/lib/session';

const TONE: Record<OversightVerdict, string> = {
  approved: 'peer-checked:border-success peer-checked:bg-success-soft peer-checked:text-success-soft-foreground',
  needs_action: 'peer-checked:border-warning-soft-foreground peer-checked:bg-warning-soft peer-checked:text-warning-soft-foreground',
  escalated: 'peer-checked:border-destructive peer-checked:bg-destructive peer-checked:text-destructive-foreground',
};

/** «قرارك» on one item: sound, needs action or escalated, with a note (required unless sound). */
export function OversightReviewForm({ locale, area, subjectId, caseId }: { locale: Locale; area: OversightArea; subjectId: string; caseId: string }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(recordReview, null);
  const [verdict, setVerdict] = useState<OversightVerdict>('approved');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (result?.ok) setNote('');
  }, [result]);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-control border border-border bg-muted/40 p-3">
      <input type="hidden" name="area" value={area} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="caseId" value={caseId} />
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t('admin.oversight.form.verdict')}</legend>
        <span className="me-1 text-xs font-semibold text-muted-foreground" aria-hidden>
          {t('admin.oversight.form.verdict')}
        </span>
        {OVERSIGHT_VERDICTS.map((option) => (
          <label key={option} className="cursor-pointer">
            <input type="radio" name="verdict" value={option} checked={verdict === option} onChange={() => setVerdict(option)} className="peer sr-only" />
            <span
              className={cn(
                'inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/40',
                TONE[option],
              )}
            >
              {t(`admin.oversight.verdicts.${option}`)}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="sr-only">{t('admin.oversight.form.note')}</span>
        <textarea
          name="note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          dir="auto"
          placeholder={t('admin.oversight.form.notePlaceholder')}
          className="w-full rounded-control border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses({ size: 'sm' })}>
          <Icon name={pending ? 'refresh' : 'check'} size={15} className={cn(pending && 'animate-spin')} />
          {t('admin.oversight.form.submit')}
        </button>
        {result && (
          <p role="status" className={cn('text-xs font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
