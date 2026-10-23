'use server';

import {
  CURRENCIES,
  parseAmountInput,
  toE164,
  toMinor,
  type CheckoutAction,
  type ContactChannel,
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

  // «اختر طريقة التواصل المفضلة»: one field, read as a WhatsApp number (Egypt by default) or an email.
  const contactChannel: ContactChannel = form.get('contactChannel') === 'email' ? 'email' : 'whatsapp';
  const contact = text(form.get('contact'));
  const email = contactChannel === 'email' ? contact : null;
  const phone = contactChannel === 'whatsapp' ? toE164(contact, currency === 'SAR' ? 'SA' : 'EG') : null;
  const contactField = `contact.${contactChannel}`;
  if (!email && !phone) return { status: 'error', code: 'VALIDATION_FAILED', fields: [contactField] };

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
    contactChannel,
    locale,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) =>
      issue.path[0] === 'donor' && issue.path[1] !== 'name'
        ? contactField
        : issue.path.slice(0, 2).join('.') === 'donor.name'
          ? 'name'
          : String(issue.path[0] ?? ''),
    );
    return { status: 'error', code: 'VALIDATION_FAILED', fields: [...new Set(fields)] };
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
