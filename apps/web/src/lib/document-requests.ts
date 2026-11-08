'use server';

import { toE164, type DomainErrorCode } from '@yusr/core';
import { documentRequestSchema } from '@yusr/core/schemas';
import { fieldsOf } from './action-errors';
import { live } from './api';
import { DEFAULT_LOCALE, isLocale } from './i18n';
import { ApiError } from '@yusr/sdk';

export type DocumentRequestState = { status: 'idle' } | { status: 'sent' } | { status: 'error'; code: DomainErrorCode | 'generic'; fields: string[] };

const text = (value: FormDataEntryValue | null): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * «اطلب الاطلاع على الوثائق»: a visitor asks to see a case's documents. Validated with the API's own
 * schema, then sent; the team sends the documents to the WhatsApp number as view-once images.
 */
export async function requestDocuments(_previous: DocumentRequestState, form: FormData): Promise<DocumentRequestState> {
  const localeValue = text(form.get('locale'));
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const slug = text(form.get('slug')) ?? '';
  const parsed = documentRequestSchema.safeParse({
    name: text(form.get('name')),
    whatsapp: toE164(text(form.get('whatsapp')), 'EG'),
    viewOnly: form.get('viewOnly') === 'on',
  });
  if (!parsed.success || !slug) {
    const fields = parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))];
    return { status: 'error', code: 'VALIDATION_FAILED', fields };
  }
  try {
    await (await live(locale)).requestDocuments(slug, parsed.data);
    return { status: 'sent' };
  } catch (error) {
    if (error instanceof ApiError) return { status: 'error', code: error.code, fields: fieldsOf(error.details) };
    console.error('requestDocuments failed');
    return { status: 'error', code: 'generic', fields: [] };
  }
}
