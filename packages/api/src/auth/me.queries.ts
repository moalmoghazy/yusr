import type { DonorNotification, Localized } from '@yusr/core';
import { DomainError } from '@yusr/core';
import type { RequestActor } from '../common/actor';
import type { Clock } from '../common/clock';
import type { Database } from '../db/ports';
import { chatwootIdentity } from '../integrations/chatwoot';

const KIND: Readonly<Record<string, DonorNotification['kind']>> = { receipt: 'receipt', case_funded: 'funded', disbursed: 'disbursed' };

/** The signed-in person's own data: profile, inbox, support-chat identity. */
export class MeQueries {
  constructor(private readonly deps: { db: Database; clock: Clock; chatwootHmacToken: string | null }) {}

  async profile(actor: RequestActor | null) {
    if (!actor) throw new DomainError('UNAUTHENTICATED');
    const user = await this.deps.db.read.users.byId(actor.id);
    if (!user) throw new DomainError('NOT_FOUND', 'User not found');
    return {
      id: user.id,
      name: user.displayName,
      email: user.email,
      phone: user.phone,
      locale: user.locale,
      roles: user.roles,
      mfa: actor.mfa,
      mfaEnrolled: user.mfaEnabled,
      chatwoot: chatwootIdentity(user.id, this.deps.chatwootHmacToken),
    };
  }

  async notifications(actor: RequestActor | null, limit = 50): Promise<DonorNotification[]> {
    if (!actor) throw new DomainError('UNAUTHENTICATED');
    const { db } = this.deps;
    const rows = await db.read.notifications.forUser(actor.id, Math.min(limit, 100));
    const result: DonorNotification[] = [];
    for (const row of rows) {
      const kind = KIND[row.template];
      if (!kind) continue;
      const slug = typeof row.payload['caseSlug'] === 'string' ? row.payload['caseSlug'] : null;
      const item = slug ? await db.read.cases.bySlug(slug) : null;
      if (!item) continue;
      result.push({
        id: row.id,
        at: row.createdAt.toISOString(),
        kind,
        caseTitle: item.title,
        caseSlug: item.slug,
        amountMinor: typeof row.payload['amountMinor'] === 'number' ? row.payload['amountMinor'] : null,
        currency: null,
        payee: (row.payload['payee'] as Localized | undefined) ?? null,
        receiptNumber: typeof row.payload['receiptNo'] === 'string' ? row.payload['receiptNo'] : null,
        read: row.readAt !== null,
      });
    }
    return result;
  }

  async markRead(actor: RequestActor | null, ids: readonly string[]): Promise<void> {
    if (!actor) throw new DomainError('UNAUTHENTICATED');
    await this.deps.db.transaction((tx) => tx.notifications.markRead(actor.id, ids.slice(0, 200), this.deps.clock.now()));
  }
}
