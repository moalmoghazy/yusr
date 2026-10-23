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
    shareText: row.shareText,
    region: row.region,
    currency: row.currency,
    goalMinor: row.goalMinor,
    platformFeeMinor: row.platformFeeMinor,
    raisedMinor: row.raisedMinor,
    donorsCount: row.donorsCount,
    isUrgent: row.isUrgent,
    deadline: iso(row.deadline),
    zakatEligible: row.zakatEligible,
    verifiedAt: iso(row.verifiedAt),
    publishedAt: iso(row.publishedAt),
    fundedAt: iso(row.fundedAt),
    priority: row.priority,
    featuredAt: iso(row.featuredAt),
    coverSeed: row.coverSeed,
    partner: row.association ? { name: row.association.name, registrationNumber: row.association.registrationNumber } : null,
    createdAt: row.createdAt.toISOString(),
  };
}
