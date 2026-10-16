'use client';

import type { ChecklistItem, Currency, Locale } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState } from 'react';
import { assignAuditor, completeVisit, setChecklistItem } from '@/app/(hub)/verification/actions';
import type { ActionResult } from '@/lib/session';

const input = 'h-9 rounded-control border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40';

function Result({ result }: { result: ActionResult }) {
  if (!result) return null;
  return (
    <p role="status" className={cn('text-xs font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
      {result.message}
    </p>
  );
}

export function AssignForm({ locale, caseId, auditors }: { locale: Locale; caseId: string; auditors: ReadonlyArray<{ id: string; name: string }> }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(assignAuditor, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="caseId" value={caseId} />
      <select name="auditorId" required aria-label={t('admin.verification.auditorLabel')} className={cn(input, 'min-w-44')} defaultValue="">
        <option value="" disabled>
          {t('admin.verification.auditorLabel')}
        </option>
        {auditors.map((auditor) => (
          <option key={auditor.id} value={auditor.id}>
            {auditor.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={buttonClasses({ size: 'sm' })}>
        <Icon name="send" size={15} />
        {t('admin.verification.assign')}
      </button>
      <Result result={result} />
    </form>
  );
}

/** One checklist line: a toggle that saves immediately (the API keeps the list per visit). */
export function ChecklistToggle({
  locale,
  taskId,
  item,
  checked,
  editable,
}: {
  locale: Locale;
  taskId: string;
  item: ChecklistItem;
  checked: boolean;
  editable: boolean;
}) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(setChecklistItem, null);
  const label = t(`admin.verification.checklist.${item}`);
  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="checked" value={String(!checked)} />
      <button
        type="submit"
        role="checkbox"
        aria-checked={checked}
        disabled={!editable || pending}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-start text-sm transition-colors enabled:hover:bg-muted disabled:cursor-default',
          checked ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
      >
        <span
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-md border',
            checked ? 'border-success bg-success text-success-foreground' : 'border-border-strong bg-card',
          )}
        >
          {checked && <Icon name="check" size={13} strokeWidth={2.8} />}
        </span>
        {label}
      </button>
      {result && !result.ok && <Result result={result} />}
    </form>
  );
}

export function CompleteForm({
  locale,
  taskId,
  currency,
  suggestedMajor,
  ready,
}: {
  locale: Locale;
  taskId: string;
  currency: Currency;
  suggestedMajor: string;
  ready: boolean;
}) {
  const { t, f } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(completeVisit, null);
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-border pt-3">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="currency" value={currency} />
      <label className="flex flex-col gap-1 text-xs font-semibold">
        {t('admin.verification.recommendedGoal')}
        <span className="flex items-center gap-2">
          <input name="recommended" required inputMode="decimal" defaultValue={suggestedMajor} dir="ltr" className={cn(input, 'w-36 tabular-nums')} />
          <span className="text-muted-foreground">{f.currencyLabel(currency)}</span>
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        {t('admin.verification.notes')}
        <textarea name="notes" rows={2} maxLength={4000} dir="auto" className={cn(input, 'h-auto py-2')} />
      </label>
      <button type="submit" disabled={!ready || pending} className={buttonClasses({ size: 'sm', className: 'self-start' })}>
        <Icon name="shield-check" size={15} />
        {t('admin.verification.approve')}
      </button>
      <Result result={result} />
    </form>
  );
}
