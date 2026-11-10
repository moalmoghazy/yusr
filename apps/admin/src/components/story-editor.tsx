'use client';

import { STORY_PHOTO_MAX_BYTES, type Locale, type Localized, type StoryPhotoType, type StoryText } from '@yusr/core';
import { Badge, buttonClasses, cn, Icon, STORY_SLIDE_GRID, StorySlide, textFor, type StorySlideData, type StorySlideLabels } from '@yusr/ui';
import { useActionState, useEffect, useRef, useState } from 'react';
import { saveStory } from '@/app/(hub)/stories/actions';
import type { ActionResult } from '@/lib/session';

/** The longest side a story photo keeps: the website shows it at most ~520 px wide. */
const PHOTO_SIDE = 1280;

const control =
  'w-full rounded-control border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-70';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** Shrinks the picture and re-encodes it (WebP, else JPEG), stepping quality down until it fits. */
async function preparePhoto(file: File): Promise<{ type: StoryPhotoType; blob: Blob }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let last: { type: StoryPhotoType; blob: Blob } | null = null;
  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // Browsers without WebP encoding hand back PNG; JPEG is the fallback then.
    const blob = webp?.type === 'image/webp' ? webp : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('encode');
    last = { type: blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg', blob };
    if (blob.size <= STORY_PHOTO_MAX_BYTES) return last;
  }
  return last!;
}

type Fields = Record<'titleAr' | 'titleEn' | 'storyAr' | 'storyEn' | 'outcomeAr' | 'outcomeEn', string>;

/** English equal to the Arabic was filled in for an empty field: show it empty again. */
const fieldsOf = (text: StoryText): Fields => {
  const en = (value: Localized) => (value.en === value.ar ? '' : value.en);
  return {
    titleAr: text.title.ar,
    titleEn: en(text.title),
    storyAr: text.story.ar,
    storyEn: en(text.story),
    outcomeAr: text.outcome.ar,
    outcomeEn: en(text.outcome),
  };
};

interface Pending {
  url: string;
  type: StoryPhotoType;
  data: string;
}

/**
 * One story in «قصص النجاح»: the live preview on top (the same component the website's reel uses, so
 * the photo's fade, the text and the contributors look exactly as they will), the photo and the text
 * below. Nothing reaches the website until «نشر على الموقع»; «حفظ وإخفاء» keeps it off the site.
 */
export function StoryEditor({
  locale,
  caseId,
  reference,
  canEdit,
  published,
  updated,
  text,
  original,
  photo,
  slides,
  labels,
}: {
  locale: Locale;
  caseId: string;
  reference: string;
  canEdit: boolean;
  published: boolean;
  updated: string | null;
  text: StoryText;
  original: StoryText;
  photo: string | null;
  slides: Record<Locale, StorySlideData>;
  labels: Record<Locale, StorySlideLabels>;
}) {
  const { t } = textFor(locale);
  const [result, action, saving] = useActionState<ActionResult, FormData>(saveStory, null);
  const [fields, setFields] = useState<Fields>(() => fieldsOf(text));
  const [pending, setPending] = useState<Pending | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [view, setView] = useState<Locale>(locale);
  const input = useRef<HTMLInputElement>(null);

  // Saved: the page now serves the uploaded photo, so the local copy goes.
  useEffect(() => {
    if (!result?.ok) return;
    setPending((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setRemoving(false);
  }, [result]);

  const set = (name: keyof Fields) => (event: { target: { value: string } }) => setFields((current) => ({ ...current, [name]: event.target.value }));
  const pick = (ar: string, en: string) => (view === 'ar' ? ar : en.trim() || ar);
  const shownPhoto = removing ? null : (pending?.url ?? photo);
  const preview: StorySlideData = {
    ...slides[view],
    title: pick(fields.titleAr, fields.titleEn),
    story: pick(fields.storyAr, fields.storyEn),
    outcome: pick(fields.outcomeAr, fields.outcomeEn),
    photo: shownPhoto,
  };
  const { t: tv } = textFor(view);
  const busy = saving || reading;
  const field = (name: keyof Fields, label: string, rows?: number) => {
    const ar = name.endsWith('Ar');
    const props = {
      name,
      value: fields[name],
      onChange: set(name),
      disabled: !canEdit,
      dir: ar ? 'rtl' : 'ltr',
      lang: ar ? 'ar' : 'en',
      required: ar,
      className: cn(control, rows ? 'leading-relaxed' : 'h-10'),
    } as const;
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        {rows ? <textarea rows={rows} {...props} /> : <input type="text" {...props} />}
      </label>
    );
  };

  return (
    <form action={action} className="flex min-w-0 flex-col gap-5">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="photoData" value={pending?.data ?? ''} />
      <input type="hidden" name="photoType" value={pending?.type ?? ''} />
      <input type="hidden" name="removePhoto" value={removing ? 'on' : ''} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-bold">
            {t('admin.stories.preview')}
            <Badge tone={published ? 'success' : 'neutral'}>{published ? t('admin.stories.published') : t('admin.stories.hidden')}</Badge>
          </h2>
          <div role="group" className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs font-semibold">
            {(['ar', 'en'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn('rounded-full px-3 py-1', view === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {option === 'ar' ? t('admin.stories.previewArabic') : t('admin.stories.previewEnglish')}
              </button>
            ))}
          </div>
        </div>
        <div
          dir={view === 'ar' ? 'rtl' : 'ltr'}
          lang={view}
          className={cn('overflow-hidden rounded-card border border-border bg-card shadow-sm', STORY_SLIDE_GRID)}
        >
          <StorySlide
            data={preview}
            labels={labels[view]}
            link={
              <span className="inline-flex items-center gap-1.5 self-start font-semibold text-primary">
                {tv('landing.stories.read')}
                <Icon name="arrow-forward" size={16} />
              </span>
            }
          />
        </div>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {reference}
          </span>
          {updated && <span>· {updated}</span>}
        </p>
      </section>

      {!canEdit && (
        <p className="flex items-start gap-2 rounded-control bg-info-soft p-3 text-sm text-info-soft-foreground">
          <Icon name="info" size={17} className="mt-0.5 shrink-0" />
          {t('admin.stories.readOnly')}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        <h3 className="text-sm font-bold">{t('admin.stories.photoTitle')}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('admin.stories.photoHint')}</p>
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
              const prepared = await preparePhoto(file);
              if (prepared.blob.size > STORY_PHOTO_MAX_BYTES) {
                setProblem(t('admin.stories.photoTooBig'));
                return;
              }
              const data = toBase64(new Uint8Array(await prepared.blob.arrayBuffer()));
              const url = URL.createObjectURL(prepared.blob);
              setPending((current) => {
                if (current) URL.revokeObjectURL(current.url);
                return { url, type: prepared.type, data };
              });
              setRemoving(false);
            } catch {
              setProblem(t('admin.stories.photoInvalid'));
            } finally {
              setReading(false);
            }
          }}
        />
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClasses({ variant: 'soft', size: 'sm' })}>
              <Icon name={reading ? 'refresh' : 'upload'} size={15} className={cn(reading && 'animate-spin')} />
              {shownPhoto ? t('admin.stories.changePhoto') : t('admin.stories.choosePhoto')}
            </button>
            {(photo || pending) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (pending) {
                    URL.revokeObjectURL(pending.url);
                    setPending(null);
                    setRemoving(photo !== null);
                  } else setRemoving((current) => !current);
                }}
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              >
                <Icon name={removing ? 'refresh' : 'x'} size={15} />
                {removing ? t('admin.stories.keepPhoto') : t('admin.stories.removePhoto')}
              </button>
            )}
          </div>
        )}
        {problem && (
          <p role="status" className="text-xs font-semibold text-destructive">
            {problem}
          </p>
        )}
        {pending && <p className="text-xs font-semibold text-warning-soft-foreground">{t('admin.stories.photoPending')}</p>}
        {removing && <p className="text-xs font-semibold text-warning-soft-foreground">{t('admin.stories.photoRemoving')}</p>}
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{t('admin.stories.fieldStory')}</h3>
          {canEdit && (
            <button type="button" onClick={() => setFields(fieldsOf(original))} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
              <Icon name="history" size={15} />
              {t('admin.stories.resetText')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {field('titleAr', `${t('admin.stories.fieldTitle')} · ${t('admin.stories.inArabic')}`)}
          {field('titleEn', `${t('admin.stories.fieldTitle')} · ${t('admin.stories.inEnglish')}`)}
          {field('storyAr', `${t('admin.stories.fieldStory')} · ${t('admin.stories.inArabic')}`, 6)}
          {field('storyEn', `${t('admin.stories.fieldStory')} · ${t('admin.stories.inEnglish')}`, 6)}
          {field('outcomeAr', `${t('admin.stories.fieldOutcome')} · ${t('admin.stories.inArabic')}`, 2)}
          {field('outcomeEn', `${t('admin.stories.fieldOutcome')} · ${t('admin.stories.inEnglish')}`, 2)}
        </div>
      </section>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" name="intent" value="publish" disabled={busy} className={buttonClasses({ size: 'md' })}>
            <Icon name={saving ? 'refresh' : 'send'} size={16} className={cn(saving && 'animate-spin')} />
            {t('admin.stories.publish')}
          </button>
          <button type="submit" name="intent" value="hide" disabled={busy} className={buttonClasses({ variant: 'ghost', size: 'md' })}>
            <Icon name="eye-off" size={16} />
            {t('admin.stories.saveHidden')}
          </button>
          {result && (
            <p role="status" className={cn('text-sm font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
              {result.message}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
