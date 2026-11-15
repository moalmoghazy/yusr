import type { DomainErrorCode } from '@yusr/core';
import { ApiError } from '@yusr/sdk';

/** What a failed server action tells the form: the error code (translated there) and the fields to mark. */
export type ActionError = {
  ok: false;
  code: DomainErrorCode | 'generic';
  fields: string[];
  /** The API's own words, when it gave a reason no field explains. */ detail?: string;
};

export function fieldsOf(details: Record<string, unknown> | undefined): string[] {
  if (!details) return [];
  if (Array.isArray(details['fields'])) return details['fields'].map(String);
  return typeof details['field'] === 'string' ? [details['field']] : [];
}

/** API errors keep their code; anything else is logged on the server and shown as a generic failure. */
export function actionError(error: unknown, context: string): ActionError {
  if (error instanceof ApiError) {
    const fields = fieldsOf(error.details);
    return { ok: false, code: error.code, fields, ...(fields.length === 0 && error.message ? { detail: error.message.slice(0, 200) } : {}) };
  }
  console.error(`${context} failed`, error);
  return { ok: false, code: 'generic', fields: [] };
}
