'use server';

import type { SubmitCaseResult, UploadTicket } from '@yusr/core';
import { presignUploadSchema, submitCaseSchema } from '@yusr/core/schemas';
import { actionError, type ActionError } from './action-errors';
import { live } from './api';
import { DEFAULT_LOCALE, isLocale } from './i18n';

/**
 * Step 1, once per document: a ten-minute link to PUT the file straight into private storage
 * (the file never passes through this server). The form then submits the storage key and the
 * file's SHA-256, so reviewers know the document they open is the one that was uploaded.
 */
export async function requestUpload(input: unknown): Promise<{ ok: true; ticket: UploadTicket } | ActionError> {
  const parsed = presignUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED', fields: ['documents'] };
  try {
    return { ok: true, ticket: await (await live(DEFAULT_LOCALE)).presignUpload(parsed.data) };
  } catch (error) {
    return actionError(error, 'requestUpload');
  }
}

/** Step 2: the case itself, validated with the API's own schema before it is sent. */
export async function sendCase(localeValue: string, input: unknown): Promise<{ ok: true; result: SubmitCaseResult } | ActionError> {
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const parsed = submitCaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_FAILED', fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))] };
  }
  try {
    const { data } = parsed;
    return { ok: true, result: await (await live(locale)).submitCase({ ...data, deadline: data.deadline ?? null, consent: true }) };
  } catch (error) {
    return actionError(error, 'sendCase');
  }
}
