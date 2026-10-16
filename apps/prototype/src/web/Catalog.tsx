import { CASE_CATEGORIES, EGYPT_GOVERNORATES, SAUDI_REGIONS, type CaseCategory, type CaseFilters, type CaseSort } from '@yusr/core';
import { useMemo, useState } from 'react';
import { useRead } from '../app/backend';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { categoryIcon } from '../ui/case-ui';
import { Button, Chip, Dialog, EmptyState, Field, Input, Select, Switch } from '../ui/primitives';
import { CaseCard } from './CaseCard';
import { useDonate } from './WebApp';

const PROGRESS_STEPS = [0, 25, 50, 75, 100];

export function CatalogPage() {
  const { t, f, locale } = useT();
  const { web, goWeb } = usePrototype();
  const donate = useDonate();
  const [q, setQ] = useState('');
  const [categories, setCategories] = useState<CaseCategory[]>(() =>
    web.category && (CASE_CATEGORIES as readonly string[]).includes(web.category) ? [web.category as CaseCategory] : [],
  );
  const [region, setRegion] = useState('');
  const [minProgress, setMinProgress] = useState(0);
  const [maxProgress, setMaxProgress] = useState(100);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [zakatOnly, setZakatOnly] = useState(false);
  const [includeFunded, setIncludeFunded] = useState(false);
  const [sort, setSort] = useState<CaseSort>('urgent');
  const [limit, setLimit] = useState(9);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters: CaseFilters = {
    q,
    categories,
    regions: region ? [region] : [],
    minProgress,
    maxProgress,
    urgentOnly,
    zakatOnly,
    includeFunded,
    sort,
    limit,
  };
  const page = useRead((read) => read.cases(filters));
  const activeCount =
    categories.length +
    (region ? 1 : 0) +
    (urgentOnly ? 1 : 0) +
    (zakatOnly ? 1 : 0) +
    (minProgress > 0 || maxProgress < 100 ? 1 : 0) +
    (includeFunded ? 1 : 0);

  const clear = () => {
    setQ('');
    setCategories([]);
    setRegion('');
    setMinProgress(0);
    setMaxProgress(100);
    setUrgentOnly(false);
    setZakatOnly(false);
    setIncludeFunded(false);
  };

  const toggleCategory = (category: CaseCategory) =>
    setCategories((current) => (current.includes(category) ? current.filter((item) => item !== category) : [...current, category]));

  const regions = useMemo(
    () => [...EGYPT_GOVERNORATES, ...SAUDI_REGIONS].slice().sort((a, b) => a.name[locale].localeCompare(b.name[locale], locale)),
    [locale],
  );

  const filterPanel = (
    <div className="filters-body">
      <div className="filter-group">
        <span className="filter-label">{t('catalog.filterCategory')}</span>
        <div className="chip-row">
          {CASE_CATEGORIES.map((category) => (
            <Chip key={category} icon={categoryIcon(category)} selected={categories.includes(category)} onClick={() => toggleCategory(category)}>
              {t(`categories.${category}`)}
            </Chip>
          ))}
        </div>
      </div>
      <Field label={t('catalog.filterRegion')} htmlFor="filter-region">
        <Select id="filter-region" value={region} onChange={(event) => setRegion(event.target.value)}>
          <option value="">{t('catalog.allRegions')}</option>
          {regions.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.name[locale]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="filter-group">
        <span className="filter-label">
          {t('catalog.filterProgress')} · {t('catalog.progressRange', { min: f.percent(minProgress), max: f.percent(maxProgress) })}
        </span>
        <div className="form-row-2">
          <Select
            aria-label={`${t('catalog.filterProgress')} min`}
            value={minProgress}
            onChange={(event) => setMinProgress(Math.min(Number(event.target.value), maxProgress))}
          >
            {PROGRESS_STEPS.slice(0, -1).map((value) => (
              <option key={value} value={value}>
                {f.percent(value)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={`${t('catalog.filterProgress')} max`}
            value={maxProgress}
            onChange={(event) => setMaxProgress(Math.max(Number(event.target.value), minProgress))}
          >
            {PROGRESS_STEPS.slice(1).map((value) => (
              <option key={value} value={value}>
                {f.percent(value)}
              </option>
            ))}
          </Select>
        </div>
        <div className="progress-presets">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMinProgress(75);
              setMaxProgress(100);
            }}
          >
            {t('catalog.sort.closest')}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMinProgress(0);
              setMaxProgress(25);
            }}
          >
            {t('catalog.sort.least_funded')}
          </button>
        </div>
      </div>
      <Switch checked={urgentOnly} onChange={setUrgentOnly} label={t('catalog.urgentOnly')} />
      <Switch checked={zakatOnly} onChange={setZakatOnly} label={t('catalog.zakatOnly')} />
      <Switch checked={includeFunded} onChange={setIncludeFunded} label={t('catalog.showFunded')} />
      {activeCount > 0 && (
        <Button variant="ghost" icon="x" onClick={clear}>
          {t('catalog.clearFilters')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="container catalog">
      <header className="page-head">
        <h1>{t('catalog.title')}</h1>
        <p>{t('catalog.subtitle')}</p>
      </header>
      <div className="catalog-layout">
        <aside className="filters" aria-label={t('common.filters')}>
          {filterPanel}
        </aside>
        <div className="results">
          <div className="results-bar">
            <Input
              icon="search"
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t('catalog.searchPlaceholder')}
              aria-label={t('common.search')}
              className="results-search"
            />
            <Button variant="outline" icon="sliders" className="filters-toggle" onClick={() => setFiltersOpen(true)}>
              {t('common.filters')}
              {activeCount > 0 && <span className="count-dot">{f.number(activeCount)}</span>}
            </Button>
            <label className="sort-label">
              <span>{t('catalog.sort.label')}</span>
              <Select value={sort} onChange={(event) => setSort(event.target.value as CaseSort)} aria-label={t('catalog.sort.label')}>
                {(['urgent', 'closest', 'newest', 'least_funded'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`catalog.sort.${value}`)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <p className="results-count" aria-live="polite">
            {t('units.results', { count: page.total })}
          </p>
          {page.items.length === 0 ? (
            <EmptyState
              title={t('catalog.empty')}
              body={t('catalog.emptyHint')}
              action={
                <Button variant="outline" onClick={clear}>
                  {t('catalog.clearFilters')}
                </Button>
              }
            />
          ) : (
            <div className="case-grid">
              {page.items.map((item) => (
                <CaseCard key={item.id} item={item} onOpen={(slug) => goWeb({ page: 'case', slug })} onDonate={donate} />
              ))}
            </div>
          )}
          {page.nextCursor && (
            <div className="load-more">
              <Button variant="outline" onClick={() => setLimit(limit + 9)}>
                {t('catalog.loadMore')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        variant="side"
        title={t('common.filters')}
        footer={
          <Button block onClick={() => setFiltersOpen(false)}>
            {t('units.results', { count: page.total })}
          </Button>
        }
      >
        {filterPanel}
      </Dialog>
    </div>
  );
}
