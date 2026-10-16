'use server';

import { parseAmountInput, toMinor, CURRENCIES, type Currency } from '@yusr/core';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/**
 * Bank transfers (InstaPay) are credited only when finance matches them on the statement:
 * the bank reference and the amount actually received, which must equal what was asked.
 */
export async function confirmTransfer(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const currency = text(form, 'currency');
  const received = parseAmountInput(text(form, 'received'));
  if (!(CURRENCIES as readonly string[]).includes(currency) || received === null) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(
    () => api.confirmTransfer(text(form, 'donationId'), text(form, 'bankReference'), toMinor(received, currency as Currency)),
    t('donationStatus.succeeded'),
  );
  if (result?.ok) revalidatePath('/finance');
  return result;
}

/** Maker-checker: the API refuses approval by the person who requested the payout. */
export async function approvePayout(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const api = await adminApi();
  const result = await attempt(() => api.approvePayout(text(form, 'payoutId')), t('admin.finance.approve'));
  if (result?.ok) revalidatePath('/finance');
  return result;
}

export async function markPayoutPaid(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const api = await adminApi();
  const result = await attempt(() => api.markPayoutPaid(text(form, 'payoutId'), text(form, 'bankReference')), t('case.disbursement.paid'));
  if (result?.ok) revalidatePath('/finance');
  return result;
}
