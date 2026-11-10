'use server';

import { recordFollowupSchema, storyPhotoSchema } from '@yusr/core/schemas';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { formId, text } from '@/lib/form';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

/** Logs a follow-up call or visit on a funded or closed case («متابعة ما بعد الصرف»). */
export async function recordFollowup(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const caseId = formId(form, 'caseId');
  const parsed = recordFollowupSchema.safeParse({
    kind: text(form, 'kind'),
    outcome: text(form, 'outcome'),
    note: text(form, 'note'),
    nextDueOn: text(form, 'nextDueOn') || null,
  });
  if (!caseId || !parsed.success) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(() => api.recordFollowup(caseId, parsed.data), t('admin.followups.form.saved'));
  if (result?.ok) revalidatePath('/followups');
  return result;
}

/** A real photo for a closed case's success story; staff blur faces before uploading. */
export async function setStoryPhoto(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const caseId = formId(form, 'caseId');
  const parsed = storyPhotoSchema.safeParse({ contentType: text(form, 'contentType'), dataBase64: text(form, 'dataBase64') });
  if (!caseId || !parsed.success) return { ok: false, message: t('admin.followups.storyPhoto.invalid') };
  const api = await adminApi();
  const result = await attempt(() => api.setStoryPhoto(caseId, parsed.data), t('admin.followups.storyPhoto.saved'));
  if (result?.ok) revalidatePath('/followups');
  return result;
}

export async function removeStoryPhoto(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const caseId = formId(form, 'caseId');
  if (!caseId) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(() => api.removeStoryPhoto(caseId), t('admin.followups.storyPhoto.removed'));
  if (result?.ok) revalidatePath('/followups');
  return result;
}
