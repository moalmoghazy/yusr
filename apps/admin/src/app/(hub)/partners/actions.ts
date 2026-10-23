'use server';

import { toE164 } from '@yusr/core';
import { createPartnerSchema, idSchema } from '@yusr/core/schemas';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { formId, text } from '@/lib/form';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

/** What the partner forms report back: the result line, and the code to show (on creation or regeneration). */
export type PartnerActionResult = (NonNullable<ActionResult> & { code?: string }) | null;

/**
 * Adds an association to the approved list. The form asks the moderator to confirm approval and
 * contract signature first; the API issues the «كود يُسر», shown once here and kept in the list.
 */
export async function createPartner(_previous: PartnerActionResult, form: FormData): Promise<PartnerActionResult> {
  const { t } = textFor(await hubLocale());
  if (text(form, 'confirm') !== 'on') return { ok: false, message: t('admin.partners.confirmContract') };
  const region = text(form, 'region');
  const parsed = createPartnerSchema.safeParse({
    name: text(form, 'name'),
    registrationNumber: text(form, 'registrationNumber'),
    region,
    contractSignedOn: text(form, 'contractSignedOn'),
    contactName: text(form, 'contactName'),
    contactPhone: toE164(text(form, 'contactPhone'), region.startsWith('SA-') ? 'SA' : 'EG') ?? '',
  });
  if (!parsed.success) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  let code = '';
  const result = await attempt(async () => {
    code = (await api.createPartner(parsed.data)).yusrCode;
  }, '');
  if (!result?.ok) return result;
  revalidatePath('/partners');
  return { ok: true, message: t('admin.partners.created'), code };
}

export async function setPartnerStatus(_previous: PartnerActionResult, form: FormData): Promise<PartnerActionResult> {
  const { t } = textFor(await hubLocale());
  const partnerId = formId(form, 'partnerId');
  const status = text(form, 'status');
  if (!partnerId || (status !== 'active' && status !== 'suspended')) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(
    () => api.setPartnerStatus(partnerId, status),
    status === 'suspended' ? t('admin.partners.suspended') : t('admin.partners.reactivated'),
  );
  if (result?.ok) revalidatePath('/partners');
  return result;
}

export async function regeneratePartnerCode(_previous: PartnerActionResult, form: FormData): Promise<PartnerActionResult> {
  const { t } = textFor(await hubLocale());
  const partnerId = text(form, 'partnerId');
  if (!idSchema.safeParse(partnerId).success) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  let code = '';
  const result = await attempt(async () => {
    code = (await api.regeneratePartnerCode(partnerId)).yusrCode;
  }, '');
  if (!result?.ok) return result;
  revalidatePath('/partners');
  return { ok: true, message: t('admin.partners.regenerated'), code };
}
