'use server';

import { caseStorySchema, storyPhotoSchema } from '@yusr/core/schemas';
import { textFor } from '@yusr/ui';
import { revalidatePath } from 'next/cache';
import { formId, text } from '@/lib/form';
import { hubLocale } from '@/lib/i18n';
import { adminApi, attempt, type ActionResult } from '@/lib/session';

/**
 * «قصص النجاح»: saves a closed case's story in one go — the new photo (or its removal), then the
 * text and whether it shows on the website. The website reads stories uncached, so it shows at once.
 */
export async function saveStory(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const { t } = textFor(await hubLocale());
  const caseId = formId(form, 'caseId');
  const published = text(form, 'intent') === 'publish';
  const parsed = caseStorySchema.safeParse({
    title: { ar: text(form, 'titleAr'), en: text(form, 'titleEn') },
    story: { ar: text(form, 'storyAr'), en: text(form, 'storyEn') },
    outcome: { ar: text(form, 'outcomeAr'), en: text(form, 'outcomeEn') },
    published,
  });
  if (!caseId || !parsed.success) return { ok: false, message: t('admin.stories.invalid') };
  const photoData = text(form, 'photoData');
  const photo = photoData ? storyPhotoSchema.safeParse({ contentType: text(form, 'photoType'), dataBase64: photoData }) : null;
  if (photo && !photo.success) return { ok: false, message: t('admin.stories.photoInvalid') };
  const removePhoto = text(form, 'removePhoto') === 'on';

  const api = await adminApi();
  const result = await attempt(
    async () => {
      if (photo?.success) await api.setStoryPhoto(caseId, photo.data);
      else if (removePhoto) await api.removeStoryPhoto(caseId);
      await api.saveStory(caseId, parsed.data);
    },
    published ? t('admin.stories.savedPublished') : t('admin.stories.savedHidden'),
  );
  if (result?.ok) revalidatePath('/stories');
  return result;
}
