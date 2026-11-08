'use server';

import { partnerLogoSchema, updatePartnerSchema } from '@yusr/core/schemas';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { formId, text } from '@/lib/form';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

/**
 * «شركاء الموقع»: what the home page's «شركاء يُسر» row shows. The website reads it uncached, so each
 * change here is live on its next visit; these actions only refresh the hub's own pages.
 */
function refresh() {
  revalidatePath('/showcase');
  revalidatePath('/partners');
}

/** Saves a logo the browser already read (SVG as is, pictures shrunk to WebP), as base64. */
export async function setPartnerLogo(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const partnerId = formId(form, 'partnerId');
  const parsed = partnerLogoSchema.safeParse({ contentType: text(form, 'contentType'), dataBase64: text(form, 'dataBase64') });
  if (!partnerId || !parsed.success) return { ok: false, message: t('admin.showcase.logoUnreadable') };
  const api = await adminApi();
  const result = await attempt(() => api.setPartnerLogo(partnerId, parsed.data), t('admin.showcase.logoSaved'));
  if (result?.ok) refresh();
  return result;
}

export async function removePartnerLogo(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const partnerId = formId(form, 'partnerId');
  if (!partnerId) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(() => api.removePartnerLogo(partnerId), t('admin.showcase.logoRemoved'));
  if (result?.ok) refresh();
  return result;
}

/** One switch per submit: `field` is showcased or newBadge, `value` on or off. */
export async function setPartnerShowcase(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const partnerId = formId(form, 'partnerId');
  const field = text(form, 'field');
  const value = text(form, 'value');
  if (!partnerId || (field !== 'showcased' && field !== 'newBadge') || (value !== 'on' && value !== 'off')) {
    return { ok: false, message: t('errors.VALIDATION_FAILED') };
  }
  const api = await adminApi();
  const result = await attempt(() => api.setPartnerShowcase(partnerId, { [field]: value === 'on' }), t('admin.showcase.saved'));
  if (result?.ok) refresh();
  return result;
}

/** The name and registration number shown under the logo (and on the association's cases). */
export async function renamePartner(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const partnerId = formId(form, 'partnerId');
  const parsed = updatePartnerSchema.safeParse({ name: text(form, 'name'), registrationNumber: text(form, 'registrationNumber') });
  if (!partnerId || !parsed.success) return { ok: false, message: t('errors.VALIDATION_FAILED') };
  const api = await adminApi();
  const result = await attempt(() => api.updatePartner(partnerId, parsed.data), t('admin.showcase.saved'));
  if (result?.ok) refresh();
  return result;
}
