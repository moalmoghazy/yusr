'use server';

import { toE164, type DomainErrorCode } from '@yusr/core';
import { partnerApplicationSchema } from '@yusr/core/schemas';
import { ApiError } from '@yusr/sdk';
import { fieldsOf } from './action-errors';
import { live } from './api';
import { DEFAULT_LOCALE, isLocale } from './i18n';

export type JoinState = { status: 'idle' } | { status: 'sent' } | { status: 'error'; code: DomainErrorCode | 'generic'; fields: string[] };

const text = (value: FormDataEntryValue | null): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * «انضم كجمعية شريكة»: an association that is not a partner yet asks to join. Validated with the API's
 * own schema, then sent; the team contacts it and, after the contract, issues its «كود يُسر».
 */
export async function applyAsPartner(_previous: JoinState, form: FormData): Promise<JoinState> {
  const localeValue = text(form.get('locale'));
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const region = text(form.get('region')) ?? '';
  const parsed = partnerApplicationSchema.safeParse({
    name: text(form.get('name')),
    registrationNumber: text(form.get('registrationNumber')),
    region,
    contactName: text(form.get('contactName')),
    contactPhone: toE164(text(form.get('contactPhone')), region.startsWith('SA-') ? 'SA' : 'EG'),
    contactEmail: text(form.get('contactEmail')),
    message: text(form.get('message')),
  });
  if (!parsed.success) {
    return { status: 'error', code: 'VALIDATION_FAILED', fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))] };
  }
  try {
    await (await live(locale)).applyAsPartner(parsed.data);
    return { status: 'sent' };
  } catch (error) {
    if (error instanceof ApiError) return { status: 'error', code: error.code, fields: fieldsOf(error.details) };
    console.error('applyAsPartner failed', error);
    return { status: 'error', code: 'generic', fields: [] };
  }
}
