import type { CaseFilters } from '@yusr/core';
import { caseFiltersSchema } from '@yusr/core/schemas';
import { buttonClasses, CaseCard, Icon, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CaseFiltersForm } from '@/components/case-filters';
import { catalog } from '@/lib/api';
import { href } from '@/lib/i18n';
import { pageLocale, type LocaleParams } from '@/lib/page';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    title: t('catalog.title'),
    description: t('catalog.subtitle'),
    alternates: { canonical: `/${locale}/cases`, languages: { ar: '/ar/cases', en: '/en/cases' } },
  };
}

/** Query string → filters, through the same schema the API validates with (bad input falls back to defaults). */
function filtersFrom(query: Record<string, string | string[] | undefined>): CaseFilters {
  const parsed = caseFiltersSchema.safeParse(query);
  const value = parsed.success ? parsed.data : caseFiltersSchema.parse({});
  return { ...value, cursor: value.cursor ?? null };
}

export default async function CasesPage({ params, searchParams }: { params: LocaleParams; searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  const query = await searchParams;
  const filters = filtersFrom(query);
  const page = await catalog(locale).listCases(filters);
  const now = Date.now();

  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'cursor' || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) next.append(key, item);
  }
  if (page.nextCursor) next.set('cursor', page.nextCursor);

  return (
    <div className="container-page flex flex-col gap-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[2.2rem] font-bold leading-snug">{t('catalog.title')}</h1>
        <p className="max-w-2xl text-muted-foreground">{t('catalog.subtitle')}</p>
      </header>

      <CaseFiltersForm locale={locale} filters={filters} />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('units.results', { count: page.total })}
      </p>

      {page.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong p-12 text-center">
          <Icon name="search" size={28} className="text-muted-foreground" />
          <h2 className="text-lg font-bold">{t('catalog.empty')}</h2>
          <p className="text-muted-foreground">{t('catalog.emptyHint')}</p>
          <Link href={href(locale, '/cases')} className={buttonClasses({ variant: 'outline', size: 'sm' })}>
            {t('catalog.clearFilters')}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((item) => (
            <li key={item.id}>
              <CaseCard item={item} locale={locale} href={href(locale, `/cases/${item.slug}`)} link={Link} now={now} headingLevel="h2" />
            </li>
          ))}
        </ul>
      )}

      {page.nextCursor && (
        <div className="flex justify-center">
          <Link href={`${href(locale, '/cases')}?${next.toString()}`} className={buttonClasses({ variant: 'outline' })} scroll={false}>
            {t('common.next')}
            <Icon name="arrow-forward" size={17} />
          </Link>
        </div>
      )}
    </div>
  );
}
