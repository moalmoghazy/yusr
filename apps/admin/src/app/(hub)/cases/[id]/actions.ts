'use server';

import type { UploadTicket } from '@yusr/core';
import { disbursementPlanSchema, presignRedactedSchema } from '@yusr/core/schemas';
import { ApiError } from '@yusr/sdk';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { explainCaseError } from '@/lib/case-errors';
import { formId } from '@/lib/form';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

/**
 * An API without object storage (the public demo, local runs) signs links to its own /dev-storage; the
 * browser goes through this hub's /dev-storage route instead (same origin, so the page's CSP allows it).
 * Links to real object storage are left alone.
 */
function sameOrigin(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.startsWith('/dev-storage/') ? `${parsed.pathname}${parsed.search}` : url;
}

/** Saves the disbursement plan (sent by the plan editor as JSON). The API keeps it fixed after that. */
export async function savePlan(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const locale = await hubLocale();
  const { t } = textFor(locale);
  const caseId = formId(form, 'caseId');
  let lines: unknown;
  try {
    lines = JSON.parse(String(form.get('lines') ?? '[]'));
  } catch {
    lines = null;
  }
  const parsed = disbursementPlanSchema.safeParse({ lines });
  if (!caseId || !parsed.success) return { ok: false, message: t('admin.caseDetail.plan.invalid') };
  const api = await adminApi();
  const result = await attempt(() => api.setDisbursementPlan(caseId, parsed.data), t('admin.caseDetail.plan.saved'), explainCaseError(locale));
  if (result?.ok) {
    revalidatePath(`/cases/${caseId}`);
    revalidatePath('/cases');
  }
  return result;
}

type UploadGrant = { ok: true; ticket: UploadTicket } | { ok: false; message: string };

/** Step 1 of a redacted copy: a ten-minute link to PUT the file into the public bucket. */
export async function requestRedactedUpload(documentId: string, input: { contentType: string; sizeBytes: number }): Promise<UploadGrant> {
  const { t } = textFor(await hubLocale());
  const parsed = presignRedactedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t('admin.caseDetail.documents.fileInvalid') };
  try {
    const ticket = await (await adminApi()).presignRedacted(documentId, parsed.data);
    return { ok: true, ticket: { ...ticket, url: sameOrigin(ticket.url) } };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/login');
      return { ok: false, message: error.code === 'VALIDATION_FAILED' ? t('admin.caseDetail.documents.fileInvalid') : t(`errors.${error.code}`) };
    }
    console.error('requestRedactedUpload failed', error);
    return { ok: false, message: t('errors.generic') };
  }
}

/** Step 2: the uploaded copy is attached to the document and shows on the case page once it is published. */
export async function confirmRedactedUpload(caseId: string, documentId: string, key: string): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const api = await adminApi();
  const result = await attempt(() => api.confirmRedacted(documentId, key), t('admin.caseDetail.documents.uploaded'));
  if (result?.ok) {
    revalidatePath(`/cases/${caseId}`);
    revalidatePath('/cases');
  }
  return result;
}

/** A five-minute link to a document's original, opened in a new tab (the API audits every opening). */
export async function openOriginal(documentId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const { t } = textFor(await hubLocale());
  try {
    const { url } = await (await adminApi()).openOriginal(documentId);
    return { ok: true, url: sameOrigin(url) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect('/login');
      return { ok: false, message: t(`errors.${error.code}`) };
    }
    console.error('openOriginal failed', error);
    return { ok: false, message: t('errors.generic') };
  }
}
