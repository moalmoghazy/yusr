import { isPubliclyVisible } from './lifecycle';
import { computeProgress } from './progress';
import type { CaseFilters, CaseSort, CaseSummary, Page } from './types';

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/**
 * Normalizes Arabic for search: strips harakat and tatweel, unifies alef/hamza forms,
 * ta marbuta and alef maqsura — so "مستشفى" matches "مستشفي" and "أيتام" matches "ايتام".
 */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
}

function progressPercent(item: CaseSummary): number {
  return computeProgress(item.raisedMinor, item.goalMinor).percent;
}

export function matchesFilters(item: CaseSummary, filters: CaseFilters): boolean {
  if (!isPubliclyVisible(item.status)) return false;
  if (!filters.includeFunded && item.status !== 'published') return false;
  if (filters.categories?.length && !filters.categories.includes(item.category)) return false;
  if (filters.regions?.length && !filters.regions.includes(item.region)) return false;
  if (filters.urgentOnly && !item.isUrgent) return false;
  if (filters.featuredOnly && !item.featuredAt) return false;
  if (filters.zakatOnly && !item.zakatEligible) return false;
  const percent = progressPercent(item);
  if (filters.minProgress !== undefined && percent < filters.minProgress) return false;
  if (filters.maxProgress !== undefined && percent > filters.maxProgress) return false;
  if (filters.q?.trim()) {
    const needle = normalizeForSearch(filters.q);
    const haystack = normalizeForSearch([item.title.ar, item.title.en, item.summary.ar, item.summary.en, item.reference].join(' '));
    if (!needle.split(' ').every((term) => haystack.includes(term))) return false;
  }
  return true;
}

function deadlineOf(item: CaseSummary): number {
  return item.deadline ? Date.parse(item.deadline) : Number.POSITIVE_INFINITY;
}

export function sortCases(items: readonly CaseSummary[], sort: CaseSort = 'urgent'): CaseSummary[] {
  const ratio = (item: CaseSummary) => item.raisedMinor / item.goalMinor;
  const published = (item: CaseSummary) => (item.publishedAt ? Date.parse(item.publishedAt) : 0);
  const byStatus = (item: CaseSummary) => (item.status === 'published' ? 0 : 1);
  return [...items].sort((a, b) => {
    const statusOrder = byStatus(a) - byStatus(b);
    if (statusOrder !== 0) return statusOrder;
    switch (sort) {
      case 'urgent':
        return b.priority - a.priority || Number(b.isUrgent) - Number(a.isUrgent) || deadlineOf(a) - deadlineOf(b) || ratio(b) - ratio(a);
      case 'closest':
        return ratio(b) - ratio(a) || b.priority - a.priority;
      case 'newest':
        return published(b) - published(a);
      case 'least_funded':
        return ratio(a) - ratio(b) || b.priority - a.priority;
    }
  });
}

/** In-memory catalog query with offset cursors (the API does the same in SQL). */
export function queryCases(items: readonly CaseSummary[], filters: CaseFilters = {}): Page<CaseSummary> {
  const limit = Math.min(Math.max(filters.limit ?? 12, 1), 50);
  const offset = filters.cursor ? Number.parseInt(filters.cursor, 10) || 0 : 0;
  const matching = sortCases(
    items.filter((item) => matchesFilters(item, filters)),
    filters.sort,
  );
  const pageItems = matching.slice(offset, offset + limit);
  const next = offset + pageItems.length;
  return {
    items: pageItems,
    total: matching.length,
    nextCursor: next < matching.length ? String(next) : null,
  };
}
