import { Badge, cn, StoryScene, storySlideData, storySlideLabels, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/no-access';
import { StoryEditor } from '@/components/story-editor';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.stories') };
}

const photoUrl = (caseId: string, version: string | null) => (version ? `/story-photos/${encodeURIComponent(caseId)}?v=${version}` : null);

/**
 * «قصص النجاح»: every closed case as the home page's «قصص نجاح» tells it. Staff with cases:edit pick
 * one, upload its real photo (faces blurred), write its title, story and outcome in Arabic (English
 * optional), watch a live preview of exactly what the website will show, and publish or hide it.
 */
export default async function StoriesPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const [staff, locale, query] = await Promise.all([currentStaff(), hubLocale(), searchParams]);
  const { t, f, l } = textFor(locale);
  if (!staff.permissions.has('cases:read')) return <NoAccess message={t('admin.noAccess')} />;

  const api = await adminApi();
  const stories = await api.stories();
  const canEdit = staff.permissions.has('cases:edit');
  const selected = stories.find((item) => item.story.id === query.case) ?? stories[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">{t('admin.stories.title')}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('admin.stories.subtitle')}</p>
      </header>

      {!selected ? (
        <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">{t('admin.stories.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[17rem_minmax(0,1fr)]">
          <nav aria-label={t('admin.stories.title')}>
            <ul className="flex gap-3 overflow-x-auto pb-2 2xl:flex-col 2xl:overflow-visible 2xl:pb-0">
              {stories.map((item) => {
                const active = item.story.id === selected.story.id;
                const photo = photoUrl(item.story.id, item.story.photoVersion);
                return (
                  <li key={item.story.id} className="w-60 shrink-0 2xl:w-auto">
                    <Link
                      href={`/stories?case=${encodeURIComponent(item.story.id)}`}
                      aria-current={active || undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-card border bg-card p-2 transition-colors hover:bg-muted',
                        active ? 'border-primary ring-2 ring-primary/25' : 'border-border',
                      )}
                    >
                      <span className="relative size-14 shrink-0 overflow-hidden rounded-control bg-muted">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- served by the hub's own proxy route
                          <img src={photo} alt="" className="size-full object-cover" />
                        ) : (
                          <StoryScene category={item.story.category} className="size-full" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="line-clamp-2 text-sm font-semibold leading-snug">{l(item.story.title)}</span>
                        <span className="flex flex-wrap gap-1">
                          <Badge tone={item.published ? 'success' : 'neutral'}>
                            {item.published ? t('admin.stories.published') : t('admin.stories.hidden')}
                          </Badge>
                          {photo && <Badge tone="gold">{t('admin.stories.photo')}</Badge>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <StoryEditor
            key={selected.story.id}
            locale={locale}
            caseId={selected.story.id}
            reference={selected.story.reference}
            canEdit={canEdit}
            published={selected.published}
            updated={
              selected.updatedAt && selected.updatedBy
                ? t('admin.stories.updated', { name: selected.updatedBy, date: f.date(selected.updatedAt, 'medium') })
                : null
            }
            text={{ title: selected.story.title, story: selected.story.story, outcome: selected.story.summary }}
            original={selected.original}
            photo={photoUrl(selected.story.id, selected.story.photoVersion)}
            slides={{ ar: storySlideData(selected.story, 'ar', null), en: storySlideData(selected.story, 'en', null) }}
            labels={{ ar: storySlideLabels('ar'), en: storySlideLabels('en') }}
          />
        </div>
      )}
    </div>
  );
}
