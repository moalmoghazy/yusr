'use server';

import {
  CURRENCIES,
  parseAmountInput,
  toE164,
  toMinor,
  type CheckoutAction,
  type CreateDonationResponse,
  type Currency,
  type DomainErrorCode,
} from '@yusr/core';
import { createDonationSchema } from '@yusr/core/schemas';
import { ApiError } from '@yusr/sdk';
import { redirect } from 'next/navigation';
import { fieldsOf } from './action-errors';
import { live } from './api';
import { DEFAULT_LOCALE, isLocale } from './i18n';

/** Checkouts that finish outside the site: a Fawry reference, an InstaPay transfer. */
export type OfflineAction = Extract<CheckoutAction, { type: 'fawry_reference' | 'bank_transfer' }>;

export type DonateState =
  | { status: 'idle' }
  | { status: 'error'; code: DomainErrorCode | 'generic'; fields: string[]; remainingMinor?: number }
  | { status: 'offline'; action: OfflineAction; chargedMinor: number; currency: Currency; receiptUrl: string };

const text = (value: FormDataEntryValue | null): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * The donate form's server action. Validates with the API's own schema, creates the donation
 * through the SDK (idempotent: the form carries one key per attempt, so a double submit or a
 * retry after a dropped connection never charges twice), then:
 *  - card / wallet / Apple Pay → redirect to the gateway's hosted checkout;
 *  - Fawry / InstaPay → return the reference or transfer details to show in place;
 *  - anything already settled → the receipt.
 */
export async function startDonation(_previous: DonateState, form: FormData): Promise<DonateState> {
  const localeValue = text(form.get('locale'));
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const currencyValue = text(form.get('currency'));
  const currency = (CURRENCIES as readonly string[]).includes(currencyValue ?? '') ? (currencyValue as Currency) : null;
  const amount = parseAmountInput(text(form.get('amount')) ?? '');
  if (!currency || amount === null) return { status: 'error', code: 'VALIDATION_FAILED', fields: ['amountMinor'] };

  const email = text(form.get('email'));
  const phone = toE164(text(form.get('phone')), currency === 'SAR' ? 'SA' : currency === 'EGP' ? 'EG' : null);
  if (!email && !phone) return { status: 'error', code: 'VALIDATION_FAILED', fields: ['donor'] };

  const parsed = createDonationSchema.safeParse({
    caseId: text(form.get('caseId')),
    amountMinor: toMinor(amount, currency),
    currency,
    method: text(form.get('method')),
    coverFees: form.get('coverFees') === 'on',
    anonymous: form.get('anonymous') === 'on',
    type: text(form.get('type')) ?? 'sadaqah',
    dedication: text(form.get('dedication')),
    donor: { name: text(form.get('name')), email, phone },
    locale,
  });
  if (!parsed.success) {
    return { status: 'error', code: 'VALIDATION_FAILED', fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))] };
  }

  const idempotencyKey = text(form.get('idempotencyKey'));
  let created: CreateDonationResponse;
  try {
    created = await (await live(locale)).createDonation(parsed.data, idempotencyKey ? { idempotencyKey } : undefined);
  } catch (error) {
    if (error instanceof ApiError) {
      const remaining = error.details?.['remainingMinor'];
      return { status: 'error', code: error.code, fields: fieldsOf(error.details), ...(typeof remaining === 'number' ? { remainingMinor: remaining } : {}) };
    }
    console.error('startDonation failed', error);
    return { status: 'error', code: 'generic', fields: [] };
  }

  const receiptUrl = `/${locale}/receipt?donation=${encodeURIComponent(created.donationId)}&token=${encodeURIComponent(created.receiptToken)}`;
  const { action } = created;
  if (action.type === 'redirect') redirect(action.url);
  if (action.type === 'fawry_reference' || action.type === 'bank_transfer') {
    return { status: 'offline', action, chargedMinor: created.breakdown.chargedMinor, currency: created.breakdown.currency, receiptUrl };
  }
  redirect(receiptUrl);
}
