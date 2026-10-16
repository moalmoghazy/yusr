import { CASE_CATEGORIES, CATEGORY_META, EGYPT_GOVERNORATES, SAUDI_REGIONS, type CaseFilters, type Locale } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import Link from 'next/link';
import { href } from '@/lib/i18n';

const SORTS = ['urgent', 'closest', 'newest', 'least_funded'] as const;

/**
 * The catalog filters as a plain GET form: every combination is a shareable URL, the page works
 * before (and without) JavaScript, and the server renders the results.
 */
export function CaseFiltersForm({ locale, filters }: { locale: Locale; filters: CaseFilters }) {
  const { t, l } = textFor(locale);
  const country = new Intl.DisplayNames([locale], { type: 'region' });
  const selected = new Set(filters.categories ?? []);
  const region = filters.regions?.[0] ?? '';
  const field =
    'h-11 w-full rounded-control border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40';

  return (
    <form action={href(locale, '/cases')} method="get" role="search" className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_14rem_14rem]">
        <label className="relative">
          <span className="sr-only">{t('common.search')}</span>
          <Icon name="search" size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="search" name="q" defaultValue={filters.q ?? ''} placeholder={t('catalog.searchPlaceholder')} className={cn(field, 'ps-10')} dir="auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="sr-only">{t('catalog.filterRegion')}</span>
          <select name="regions" defaultValue={region} className={field} aria-label={t('catalog.filterRegion')}>
            <option value="">{t('catalog.allRegions')}</option>
            <optgroup label={country.of('EG')}>
              {EGYPT_GOVERNORATES.map((item) => (
                <option key={item.code} value={item.code}>
                  {l(item.name)}
                </option>
              ))}
            </optgroup>
            <optgroup label={country.of('SA')}>
              {SAUDI_REGIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {l(item.name)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="sr-only">{t('catalog.sort.label')}</span>
          <select name="sort" defaultValue={filters.sort ?? 'urgent'} className={field} aria-label={t('catalog.sort.label')}>
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`catalog.sort.${sort}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('catalog.filterCategory')}</legend>
        {CASE_CATEGORIES.map((category) => (
          <label key={category} className="cursor-pointer">
            <input type="checkbox" name="categories" value={category} defaultChecked={selected.has(category)} className="peer sr-only" />
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-semibold transition-colors',
                'peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary-soft-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
              )}
            >
              <Icon name={CATEGORY_META[category].icon} size={15} />
              {t(`categories.${category}`)}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {(
            [
              ['urgentOnly', t('catalog.urgentOnly'), filters.urgentOnly],
              ['zakatOnly', t('catalog.zakatOnly'), filters.zakatOnly],
              ['includeFunded', t('catalog.showFunded'), filters.includeFunded],
            ] as const
          ).map(([name, label, checked]) => (
            <label key={name} className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" name={name} value="true" defaultChecked={Boolean(checked)} className="size-4 accent-[var(--primary)]" />
              {label}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Link href={href(locale, '/cases')} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
            {t('catalog.clearFilters')}
          </Link>
          <button type="submit" className={buttonClasses({ size: 'sm' })}>
            <Icon name="filter" size={16} />
            {t('common.apply')}
          </button>
        </div>
      </div>
    </form>
  );
}
