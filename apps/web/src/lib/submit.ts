'use server';

import type { SubmitCaseResult, UploadTicket } from '@yusr/core';
import { presignUploadSchema, submitCaseSchema } from '@yusr/core/schemas';
import { actionError, type ActionError } from './action-errors';
import { live } from './api';
import { DEFAULT_LOCALE, isLocale } from './i18n';

/** Which fields a schema failure points at: the association's ones by their full path (association.yusrCode). */
function invalidFields(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string[] {
  return [...new Set(issues.map((issue) => (issue.path[0] === 'association' ? issue.path.map(String).join('.') : String(issue.path[0] ?? ''))))];
}

/**
 * Step 1, once per document: a ten-minute link to PUT the file straight into private storage
 * (the file never passes through this server). The form then submits the storage key and the
 * file's SHA-256, so reviewers know the document they open is the one that was uploaded.
 * A partner association needs no account: its رقم الإشهار and «كود يُسر» (in `association`) are checked by
 * the API, which puts the file under the partner's own prefix.
 */
export async function requestUpload(input: unknown): Promise<{ ok: true; ticket: UploadTicket } | ActionError> {
  const parsed = presignUploadSchema.safeParse(input);
  if (!parsed.success) {
    const fields = invalidFields(parsed.error.issues);
    return { ok: false, code: 'VALIDATION_FAILED', fields: fields.some((field) => field.startsWith('association')) ? fields : ['documents'] };
  }
  try {
    return { ok: true, ticket: await (await live(DEFAULT_LOCALE)).presignUpload(parsed.data) };
  } catch (error) {
    return actionError(error, 'requestUpload');
  }
}

/** Step 2: the case itself, validated with the API's own schema before it is sent (with the same partner credentials). */
export async function sendCase(localeValue: string, input: unknown): Promise<{ ok: true; result: SubmitCaseResult } | ActionError> {
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const parsed = submitCaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_FAILED', fields: invalidFields(parsed.error.issues) };
  }
  try {
    const { data } = parsed;
    return { ok: true, result: await (await live(locale)).submitCase({ ...data, deadline: data.deadline ?? null, consent: true }) };
  } catch (error) {
    return actionError(error, 'sendCase');
  }
}
