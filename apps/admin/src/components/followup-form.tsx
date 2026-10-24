'use client';

import { FOLLOWUP_KINDS, FOLLOWUP_OUTCOMES, type Locale } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState, useState } from 'react';
import { recordFollowup } from '@/app/(hub)/followups/actions';
import type { ActionResult } from '@/lib/session';

const control =
  'h-10 w-full rounded-control border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40';

/**
 * «سجّل متابعة» on one case, folded unless the case needs a check. It keeps its own open state, so the
 * page refreshing after a save (the case may now be «مطمئنة») doesn't fold away the confirmation.
 */
export function FollowupPanel({ locale, caseId, tomorrow, open }: { locale: Locale; caseId: string; tomorrow: string; open: boolean }) {
  const { t } = textFor(locale);
  const [expanded, setExpanded] = useState(open);
  return (
    <details className="group rounded-control border border-border" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-bold">
        <span className="inline-flex items-center gap-2">
          <Icon name="plus" size={16} className="text-primary" />
          {t('admin.followups.form.title')}
        </span>
        <Icon name="chevron-down" size={16} className="text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border p-3">
        <FollowupForm locale={locale} caseId={caseId} tomorrow={tomorrow} />
      </div>
    </details>
  );
}

/** Logs a call or visit on one case; `tomorrow` (YYYY-MM-DD, Cairo) is the earliest next check. */
function FollowupForm({ locale, caseId, tomorrow }: { locale: Locale; caseId: string; tomorrow: string }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(recordFollowup, null);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="caseId" value={caseId} />
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">{t('admin.followups.form.kind')}</span>
        <select name="kind" defaultValue="beneficiary_call" className={control}>
          {FOLLOWUP_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`admin.followups.kinds.${kind}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">{t('admin.followups.form.outcome')}</span>
        <select name="outcome" defaultValue="confirmed" className={control}>
          {FOLLOWUP_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {t(`admin.followups.outcomes.${outcome}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
        <span className="font-semibold">{t('admin.followups.form.note')}</span>
        <textarea
          name="note"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          dir="auto"
          placeholder={t('admin.followups.form.notePlaceholder')}
          className={cn(control, 'h-auto py-2 leading-relaxed')}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">{t('admin.followups.form.nextDueOn')}</span>
        <input name="nextDueOn" type="date" min={tomorrow} className={control} />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <button type="submit" disabled={pending} className={buttonClasses({ className: 'sm:self-start' })}>
          <Icon name="check" size={17} />
          {t('admin.followups.form.submit')}
        </button>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground sm:col-span-2">
        <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
        {t('admin.followups.form.privacy')}
      </p>
      {result && (
        <p role="status" className={cn('text-xs font-semibold sm:col-span-2', result.ok ? 'text-success' : 'text-destructive')}>
          {result.message}
        </p>
      )}
    </form>
  );
}
