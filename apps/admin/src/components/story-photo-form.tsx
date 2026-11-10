'use client';

import { STORY_PHOTO_MAX_BYTES, type Locale, type StoryPhotoType } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { startTransition, useActionState, useRef, useState } from 'react';
import { removeStoryPhoto, setStoryPhoto } from '@/app/(hub)/followups/actions';
import type { ActionResult } from '@/lib/session';

/** The longest side a story photo keeps: the website shows it at most ~520 px wide. */
const PHOTO_SIDE = 1280;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** Shrinks the picture and re-encodes it (WebP, else JPEG), stepping quality down until it fits. */
async function preparePhoto(file: File): Promise<{ contentType: StoryPhotoType; bytes: Uint8Array }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let last: { contentType: StoryPhotoType; bytes: Uint8Array } | null = null;
  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // Browsers without WebP encoding hand back PNG; JPEG is the fallback then.
    const blob = webp?.type === 'image/webp' ? webp : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('encode');
    last = { contentType: blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) };
    if (last.bytes.length <= STORY_PHOTO_MAX_BYTES) return last;
  }
  return last!;
}

function Result({ result }: { result: ActionResult }) {
  if (!result) return null;
  return (
    <p role="status" className={cn('text-xs font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
      {result.message}
    </p>
  );
}

/**
 * «صورة قصة النجاح» for a closed case: a real photo replaces the illustrated scene in «قصص نجاح» on the
 * website. Staff blur faces and anything identifying before uploading; the site says so under the photo.
 */
export function StoryPhotoForm({ locale, caseId, version }: { locale: Locale; caseId: string; version: string | null }) {
  const { t } = textFor(locale);
  const [saved, save, saving] = useActionState<ActionResult, FormData>(setStoryPhoto, null);
  const [removed, remove, removing] = useActionState<ActionResult, FormData>(removeStoryPhoto, null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = saving || reading || removing;

  return (
    <section className="flex flex-col gap-3 rounded-control border border-border p-3 sm:flex-row sm:items-start">
      <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-control bg-muted sm:w-40">
        {version ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the hub's own proxy route
          <img src={`/story-photos/${encodeURIComponent(caseId)}?v=${version}`} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <Icon name="scan-face" size={28} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <h3 className="text-sm font-bold">{t('admin.followups.storyPhoto.title')}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('admin.followups.storyPhoto.hint')}</p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setProblem(null);
            setReading(true);
            try {
              const photo = await preparePhoto(file);
              if (photo.bytes.length > STORY_PHOTO_MAX_BYTES) {
                setProblem(t('admin.followups.storyPhoto.tooBig'));
                return;
              }
              const form = new FormData();
              form.set('caseId', caseId);
              form.set('contentType', photo.contentType);
              form.set('dataBase64', toBase64(photo.bytes));
              startTransition(() => save(form));
            } catch {
              setProblem(t('admin.followups.storyPhoto.invalid'));
            } finally {
              setReading(false);
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClasses({ variant: 'soft', size: 'sm' })}>
            <Icon name={saving || reading ? 'refresh' : 'upload'} size={15} className={cn((saving || reading) && 'animate-spin')} />
            {version ? t('admin.followups.storyPhoto.replace') : t('admin.followups.storyPhoto.upload')}
          </button>
          {version && (
            <form
              action={remove}
              onSubmit={(event) => {
                if (!window.confirm(t('admin.followups.storyPhoto.removeConfirm'))) event.preventDefault();
              }}
            >
              <input type="hidden" name="caseId" value={caseId} />
              <button type="submit" disabled={busy} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
                <Icon name="x" size={15} />
                {t('admin.followups.storyPhoto.remove')}
              </button>
            </form>
          )}
        </div>
        {problem ? (
          <p role="status" className="text-xs font-semibold text-destructive">
            {problem}
          </p>
        ) : (
          <Result result={removed ?? saved} />
        )}
      </div>
    </section>
  );
}
