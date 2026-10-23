import { idSchema } from '@yusr/core/schemas';

/** A form field as trimmed text ('' when missing). */
export const text = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();

/** A form field that must be a record id (UUID); null otherwise, so the action can refuse it. */
export function formId(form: FormData, name: string): string | null {
  const value = text(form, name);
  return idSchema.safeParse(value).success ? value : null;
}
