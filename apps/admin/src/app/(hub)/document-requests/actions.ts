'use server';

import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { formId, text } from '@/lib/form';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

/** Marks a request to see documents as sent (they went out on WhatsApp) or declined. */
export async function setDocumentRequestStatus(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const requestId = formId(form, 'requestId');
  const status = text(form, 'status');
  if (!requestId || (status !== 'sent' && status !== 'declined')) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(() => api.setDocumentRequestStatus(requestId, status), t(`admin.documentRequests.statuses.${status}`));
  // The nav counter lives in the layout, so refresh every hub page.
  if (result?.ok) revalidatePath('/', 'layout');
  return result;
}
