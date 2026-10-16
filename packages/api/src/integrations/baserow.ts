import type { FetchLike } from '../payments/gateway';
import { callJson } from '../payments/http';

/**
 * Field-visit board for volunteers on Baserow (open source, self-hostable Airtable).
 * The worker creates (or updates) a row when a visit is assigned, so field
 * coordinators can plan routes in a familiar grid. The board is a view, not the record:
 * the checklist and sign-off happen in the control hub, which is what the case pipeline trusts.
 */
export interface VisitRow {
  reference: string;
  region: string;
  auditor: string;
  visitAt: string | null;
  status: 'assigned' | 'scheduled' | 'completed';
  adminUrl: string;
}

export class BaserowClient {
  constructor(
    private readonly config: { url: string; token: string; visitsTableId: string } | null,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async upsertVisit(row: VisitRow, existingId: number | null): Promise<number | null> {
    if (!this.config) return null;
    const base = `${this.config.url.replace(/\/$/, '')}/api/database/rows/table/${this.config.visitsTableId}`;
    const body = {
      Case: row.reference,
      Region: row.region,
      Auditor: row.auditor,
      'Visit date': row.visitAt,
      Status: row.status,
      Link: row.adminUrl,
    };
    const headers = { authorization: `Token ${this.config.token}` };
    const result = existingId
      ? await callJson<{ id: number }>(this.fetchImpl, 'baserow', `${base}/${existingId}/?user_field_names=true`, { method: 'PATCH', headers, body })
      : await callJson<{ id: number }>(this.fetchImpl, 'baserow', `${base}/?user_field_names=true`, { headers, body });
    return result.id;
  }
}
