'use server';

import { CHECKLIST_ITEMS, parseAmountInput, toMinor, CURRENCIES, type ChecklistItem, type Currency } from '@yusr/core';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/** A moderator sends a field auditor to a case under review (the API refuses the case's own submitter). */
export async function assignAuditor(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const api = await adminApi();
  const result = await attempt(() => api.assignAuditor(text(form, 'caseId'), text(form, 'auditorId')), t('admin.verification.assignedDone'));
  if (result?.ok) revalidatePath('/verification');
  return result;
}

/** The auditor ticks the checklist as the visit goes (only their own visits; super admins too). */
export async function setChecklistItem(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const item = text(form, 'item');
  if (!(CHECKLIST_ITEMS as readonly string[]).includes(item)) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(
    () => api.updateChecklist(text(form, 'taskId'), item as ChecklistItem, form.get('checked') === 'true'),
    t('admin.verification.savedDone'),
  );
  if (result?.ok) revalidatePath('/verification');
  return result;
}

/** Sign-off: every item checked, a verified goal, and the case moves to field_verified. */
export async function completeVisit(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const currency = text(form, 'currency');
  const amount = parseAmountInput(text(form, 'recommended'));
  if (!(CURRENCIES as readonly string[]).includes(currency) || amount === null) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(
    () => api.completeVerification(text(form, 'taskId'), toMinor(amount, currency as Currency), text(form, 'notes') || undefined),
    t('admin.verification.completedDone'),
  );
  if (result?.ok) {
    revalidatePath('/verification');
    revalidatePath('/cases');
  }
  return result;
}
