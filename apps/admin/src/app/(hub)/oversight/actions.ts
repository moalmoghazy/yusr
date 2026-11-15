'use server';

import { oversightReviewSchema } from '@yusr/core/schemas';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { text } from '@/lib/form';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

/** Records the super admin's verdict on a case, a field verification or a follow-up. */
export async function recordReview(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const parsed = oversightReviewSchema.safeParse({
    area: text(form, 'area'),
    subjectId: text(form, 'subjectId'),
    caseId: text(form, 'caseId'),
    verdict: text(form, 'verdict'),
    note: text(form, 'note'),
  });
  if (!parsed.success) {
    const noteMissing = parsed.error.issues.some((issue) => issue.path[0] === 'note');
    return { ok: false, message: noteMissing ? t('admin.oversight.form.noteRequired') : t('errors.VALIDATION_FAILED') };
  }
  const api = await adminApi();
  const result = await attempt(() => api.recordOversightReview(parsed.data), t('admin.oversight.form.saved'));
  if (result?.ok) revalidatePath('/oversight');
  return result;
}
