'use server';

import { CASE_STATUSES, type CaseStatus } from '@yusr/core';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { formId } from '@/lib/form';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

/** Moves a case along the pipeline. The API re-checks the rule, the role and the reason. */
export async function transitionCase(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const caseId = formId(form, 'caseId');
  const to = String(form.get('to') ?? '');
  if (!caseId || !(CASE_STATUSES as readonly string[]).includes(to)) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const reason = String(form.get('reason') ?? '').trim() || undefined;
  const api = await adminApi();
  const result = await attempt(
    () => api.transitionCase(caseId, to as CaseStatus, reason),
    t('admin.cases.transitioned', { status: t(`status.${to as CaseStatus}`) }),
  );
  if (result?.ok) revalidatePath('/cases');
  return result;
}

/** Saves a case's share line («نص المشاركة»); both languages empty clears it, so the line is composed. */
export async function saveShareText(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const caseId = formId(form, 'caseId');
  if (!caseId) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const ar = String(form.get('ar') ?? '').trim();
  const en = String(form.get('en') ?? '').trim();
  if (Boolean(ar) !== Boolean(en)) return { ok: false, message: t('admin.cases.shareTextBoth') };
  const shareText = ar && en ? { ar, en } : null;
  const api = await adminApi();
  const result = await attempt(() => api.editCase(caseId, { shareText }), shareText ? t('admin.cases.shareTextSaved') : t('admin.cases.shareTextCleared'));
  if (result?.ok) revalidatePath('/cases');
  return result;
}

export async function togglePriority(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const caseId = formId(form, 'caseId');
  if (!caseId) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const pinned = form.get('pinned') === 'true';
  const api = await adminApi();
  const result = await attempt(() => api.setPriority(caseId, pinned ? 0 : 10), pinned ? t('admin.cases.unprioritize') : t('admin.cases.pinned'));
  if (result?.ok) revalidatePath('/cases');
  return result;
}
