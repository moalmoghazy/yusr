import type { CaseSummary } from '@yusr/core';
import type { CaseRow } from '../db/rows';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/** Public card shape shared with web and mobile (@yusr/core CaseSummary). */
export function toCaseSummary(row: CaseRow): CaseSummary {
  return {
    id: row.id,
    slug: row.slug,
    reference: row.reference,
    category: row.category,
    status: row.status,
    title: row.title,
    summary: row.summary,
    region: row.region,
    currency: row.currency,
    goalMinor: row.goalMinor,
    raisedMinor: row.raisedMinor,
    donorsCount: row.donorsCount,
    isUrgent: row.isUrgent,
    deadline: iso(row.deadline),
    zakatEligible: row.zakatEligible,
    verifiedAt: iso(row.verifiedAt),
    publishedAt: iso(row.publishedAt),
    fundedAt: iso(row.fundedAt),
    priority: row.priority,
    coverSeed: row.coverSeed,
    createdAt: row.createdAt.toISOString(),
  };
}
