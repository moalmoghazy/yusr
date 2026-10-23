/**
 * PostgreSQL implementation of the persistence ports (Drizzle ORM on node-postgres).
 * Row locks use SELECT … FOR UPDATE; the ledger invariants are checked by the
 * database itself at COMMIT (see the deferred trigger in 0000_init.sql), and the
 * errors it raises are translated back into domain errors here.
 */
import { DomainError, accountType, normalizeForSearch, type Currency } from '@yusr/core';
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CasePage, Database, LockMode, RatesToEgp, Tx } from './ports';
import type { CaseFundSummary, CaseRow, DonationRow, JournalLineRow, OutboxRow, PaymentAttemptRow } from './rows';
import * as t from './schema';

type Db = NodePgDatabase<typeof t.schema>;
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

const FIXED_CURRENCY: Readonly<Record<string, Currency>> = {
  'asset:clearing:paymob': 'EGP',
  'asset:clearing:fawry': 'EGP',
  'asset:clearing:instapay': 'EGP',
  'asset:clearing:moyasar': 'SAR',
  'asset:clearing:stripe': 'USD',
};

function first<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function locked<Q extends { for: (strength: 'update' | 'share') => Q }>(query: Q, lock?: LockMode): Q {
  return lock ? query.for(lock) : query;
}

function toCase(row: typeof t.cases.$inferSelect): CaseRow {
  const { progressPercent: _progress, searchText: _search, ...rest } = row;
  return rest as CaseRow;
}

function toDonation(row: typeof t.donations.$inferSelect): DonationRow {
  return { ...row, fxRate: Number(row.fxRate) } as DonationRow;
}

/** Page cursors are offsets this API issued: a non-negative integer, anything else starts over. */
export function parseCursor(cursor: string | null | undefined): number {
  if (!cursor || !/^\d{1,9}$/.test(cursor)) return 0;
  return Number.parseInt(cursor, 10);
}

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`);

/** PostgreSQL errors raised by our constraints and triggers, in domain terms. */
export function mapPgError(error: unknown): unknown {
  const pg = error as { code?: string; message?: string; constraint?: string };
  const message = pg.message ?? '';
  // Clients get fixed messages: the database's own wording (ids, amounts, table names) is never sent.
  if (/is unbalanced|needs at least two lines/.test(message)) return new DomainError('LEDGER_UNBALANCED', 'The journal entry does not balance');
  if (/would be overdrawn/.test(message)) return new DomainError('INSUFFICIENT_CASE_FUNDS', 'The case fund does not hold enough');
  if (/only holds/.test(message)) return new DomainError('CURRENCY_MISMATCH', 'The account holds another currency');
  if (/cannot move from|new cases start/.test(message)) return new DomainError('INVALID_TRANSITION', 'This status change is not allowed');
  if (/only the platform can move/.test(message)) return new DomainError('FORBIDDEN_TRANSITION', 'Only the platform can make this status change');
  if (/is append-only/.test(message)) return new DomainError('FORBIDDEN', 'Records here cannot be changed');
  if (pg.constraint === 'payouts_four_eyes' || pg.constraint === 'refunds_four_eyes') return new DomainError('SELF_APPROVAL_FORBIDDEN');
  if (pg.code === '23505' && /idempotency_key/.test(pg.constraint ?? message)) return new DomainError('IDEMPOTENCY_CONFLICT');
  // Constraint names and PostgreSQL's wording describe the schema: they are not sent either.
  if (pg.code === '23505') return new DomainError('VALIDATION_FAILED', 'This record already exists');
  if (pg.code === '23514' || pg.code === '23503' || pg.code === '23502')
    return new DomainError('VALIDATION_FAILED', 'The request does not satisfy a data rule');
  // Malformed input that reached a query (e.g. a value that is not a UUID): a client error, not a 500.
  if (pg.code === '22P02') return new DomainError('VALIDATION_FAILED', 'A value has the wrong format');
  return error;
}

export class DrizzleDatabase implements Database {
  readonly read: Tx;

  constructor(private readonly db: Db) {
    this.read = createTx(db);
  }

  async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction((executor) => work(createTx(executor)), { isolationLevel: 'read committed' });
    } catch (error) {
      throw mapPgError(error);
    }
  }

  /** Demo and fixture data may start cases in any status (see enforce_case_entry). */
  async seed(work: (tx: Tx) => Promise<void>): Promise<void> {
    await this.transaction(async (tx) => {
      await (tx as Tx & { raw: Executor }).raw.execute(sql`select set_config('yusr.actor_kind', 'seed', true)`);
      await work(tx);
    });
  }
}

function createTx(x: Executor): Tx & { raw: Executor } {
  return {
    raw: x,

    // ------------------------------------------------------------------ users
    users: {
      byId: async (id) => first(await x.select().from(t.users).where(eq(t.users.id, id)).limit(1)),
      byPhone: async (phone) => first(await x.select().from(t.users).where(eq(t.users.phone, phone)).limit(1)),
      byEmail: async (email) => first(await x.select().from(t.users).where(eq(t.users.email, email)).limit(1)),
      insert: async (row) => {
        await x.insert(t.users).values(row);
      },
      update: async (id, patch) => {
        await x
          .update(t.users)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(t.users.id, id));
      },
      claimTotpStep: async (id, step) => {
        const rows = await x
          .update(t.users)
          .set({ totpLastStep: step })
          .where(and(eq(t.users.id, id), sql`(${t.users.totpLastStep} IS NULL OR ${t.users.totpLastStep} < ${step})`))
          .returning({ id: t.users.id });
        return rows.length > 0;
      },
      staff: async () =>
        x
          .select()
          .from(t.users)
          .where(sql`${t.users.roles} && ARRAY['field_auditor','content_moderator','financial_officer','super_admin']::user_role[]`),
      identity: async (provider, subject) =>
        first(
          await x
            .select()
            .from(t.authIdentities)
            .where(and(eq(t.authIdentities.provider, provider), eq(t.authIdentities.subject, subject)))
            .limit(1),
        ),
      insertIdentity: async (row) => {
        await x.insert(t.authIdentities).values(row);
      },
      insertVolunteer: async (row) => {
        await x.insert(t.volunteerProfiles).values(row).onConflictDoNothing({ target: t.volunteerProfiles.userId });
      },
    },

    refreshTokens: {
      byHash: async (hash, lock) => first(await locked(x.select().from(t.refreshTokens).where(eq(t.refreshTokens.tokenHash, hash)).limit(1).$dynamic(), lock)),
      insert: async (row) => {
        await x.insert(t.refreshTokens).values(row);
      },
      markReplaced: async (id, replacedBy, at) => {
        await x.update(t.refreshTokens).set({ replacedBy, revokedAt: at }).where(eq(t.refreshTokens.id, id));
      },
      revokeFamily: async (familyId, at) => {
        const rows = await x
          .update(t.refreshTokens)
          .set({ revokedAt: at })
          .where(and(eq(t.refreshTokens.familyId, familyId), isNull(t.refreshTokens.revokedAt)))
          .returning({ id: t.refreshTokens.id });
        return rows.length;
      },
      revokeAllForUser: async (userId, at) => {
        const rows = await x
          .update(t.refreshTokens)
          .set({ revokedAt: at })
          .where(and(eq(t.refreshTokens.userId, userId), isNull(t.refreshTokens.revokedAt)))
          .returning({ id: t.refreshTokens.id });
        return rows.length;
      },
    },

    // ------------------------------------------------------------------ cases
    cases: {
      byId: async (id, lock) => {
        const row = first(await locked(x.select().from(t.cases).where(eq(t.cases.id, id)).limit(1).$dynamic(), lock));
        return row ? toCase(row) : null;
      },
      bySlug: async (slug) => {
        const row = first(await x.select().from(t.cases).where(eq(t.cases.slug, slug)).limit(1));
        return row ? toCase(row) : null;
      },
      search: async (filters): Promise<CasePage> => {
        const conditions: SQL[] = [inArray(t.cases.status, [...filters.statuses])];
        if (filters.categories?.length) conditions.push(inArray(t.cases.category, filters.categories));
        if (filters.regions?.length) conditions.push(inArray(t.cases.region, filters.regions));
        if (filters.urgentOnly) conditions.push(eq(t.cases.isUrgent, true));
        if (filters.zakatOnly) conditions.push(eq(t.cases.zakatEligible, true));
        if (filters.minProgress !== undefined) conditions.push(gte(t.cases.progressPercent, filters.minProgress));
        if (filters.maxProgress !== undefined) conditions.push(lte(t.cases.progressPercent, filters.maxProgress));
        if (filters.q?.trim()) {
          for (const term of normalizeForSearch(filters.q).split(' ').filter(Boolean)) {
            conditions.push(sql`${t.cases.searchText} LIKE ${`%${escapeLike(term)}%`}`);
          }
        }
        const where = and(...conditions);
        const ratio = sql`(${t.cases.raisedMinor}::numeric / ${t.cases.goalMinor})`;
        const liveFirst = sql`CASE WHEN ${t.cases.status} = 'published' THEN 0 ELSE 1 END`;
        const order: SQL[] = {
          urgent: [liveFirst, desc(t.cases.priority), desc(t.cases.isUrgent), sql`${t.cases.deadline} ASC NULLS LAST`, sql`${ratio} DESC`],
          closest: [liveFirst, sql`${ratio} DESC`, desc(t.cases.priority)],
          newest: [liveFirst, sql`${t.cases.publishedAt} DESC NULLS LAST`],
          least_funded: [liveFirst, sql`${ratio} ASC`, desc(t.cases.priority)],
        }[filters.sort ?? 'urgent'];
        const limit = Math.min(Math.max(filters.limit ?? 12, 1), 50);
        const offset = parseCursor(filters.cursor);
        const [rows, totals] = await Promise.all([
          x
            .select()
            .from(t.cases)
            .where(where)
            .orderBy(...order)
            .limit(limit)
            .offset(offset),
          x
            .select({ total: sql<number>`count(*)::int` })
            .from(t.cases)
            .where(where),
        ]);
        const total = totals[0]?.total ?? 0;
        const next = offset + rows.length;
        return { items: rows.map(toCase), total, nextCursor: next < total ? String(next) : null };
      },
      insert: async (row) => {
        const [created] = await x.insert(t.cases).values(row).returning();
        return toCase(created!);
      },
      update: async (id, patch) => {
        if ('status' in patch) throw new Error('Use setStatus() to change a case status');
        await x.update(t.cases).set(patch).where(eq(t.cases.id, id));
      },
      setStatus: async (id, to, options) => {
        if (options?.system) await x.execute(sql`select set_config('yusr.actor_kind', 'system', true)`);
        const [row] = await x.update(t.cases).set({ status: to }).where(eq(t.cases.id, id)).returning();
        if (!row) throw new DomainError('NOT_FOUND', `case ${id} not found`);
        return toCase(row);
      },
      credit: async (id, amountMinor, donors) => {
        const [row] = await x
          .update(t.cases)
          .set({ raisedMinor: sql`${t.cases.raisedMinor} + ${amountMinor}`, donorsCount: sql`${t.cases.donorsCount} + ${donors}` })
          .where(eq(t.cases.id, id))
          .returning({ raisedMinor: t.cases.raisedMinor, goalMinor: t.cases.goalMinor, status: t.cases.status, donorsCount: t.cases.donorsCount });
        if (!row) throw new DomainError('NOT_FOUND', `case ${id} not found`);
        return row;
      },
      insertTransition: async (row) => {
        await x.insert(t.caseTransitions).values(row);
      },
      transitions: async (caseId) => x.select().from(t.caseTransitions).where(eq(t.caseTransitions.caseId, caseId)).orderBy(asc(t.caseTransitions.id)),
      documents: async (caseId) => x.select().from(t.caseDocuments).where(eq(t.caseDocuments.caseId, caseId)).orderBy(asc(t.caseDocuments.createdAt)),
      insertDocument: async (row) => {
        await x.insert(t.caseDocuments).values(row);
      },
      updateDocument: async (id, patch) => {
        await x.update(t.caseDocuments).set(patch).where(eq(t.caseDocuments.id, id));
      },
      document: async (id) => first(await x.select().from(t.caseDocuments).where(eq(t.caseDocuments.id, id)).limit(1)),
      lines: async (caseId) => x.select().from(t.disbursementLines).where(eq(t.disbursementLines.caseId, caseId)).orderBy(asc(t.disbursementLines.position)),
      line: async (id) => first(await x.select().from(t.disbursementLines).where(eq(t.disbursementLines.id, id)).limit(1)),
      insertLines: async (rows) => {
        if (rows.length) await x.insert(t.disbursementLines).values([...rows]);
      },
      beneficiary: async (id) => first(await x.select().from(t.beneficiaries).where(eq(t.beneficiaries.id, id)).limit(1)),
      beneficiaryByNationalIdHash: async (hash) => first(await x.select().from(t.beneficiaries).where(eq(t.beneficiaries.nationalIdHash, hash)).limit(1)),
      insertBeneficiary: async (row) => {
        await x.insert(t.beneficiaries).values(row);
      },
    },

    // ------------------------------------------------------------------ approved partners
    partners: {
      byId: async (id, lock) => first(await locked(x.select().from(t.partners).where(eq(t.partners.id, id)).limit(1).$dynamic(), lock)),
      byRegistrationNumber: async (registrationNumber) =>
        first(await x.select().from(t.partners).where(eq(t.partners.registrationNumber, registrationNumber)).limit(1)),
      byCodeHash: async (codeHash) => first(await x.select().from(t.partners).where(eq(t.partners.codeHash, codeHash)).limit(1)),
      list: async () => x.select().from(t.partners).orderBy(desc(t.partners.createdAt)),
      insert: async (row) => {
        await x.insert(t.partners).values(row);
      },
      update: async (id, patch) => {
        // partners_sync_cases (0006) renames the partner on its cases in the same statement.
        await x
          .update(t.partners)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(t.partners.id, id));
      },
      caseCounts: async () => {
        const rows = await x
          .select({ partnerId: t.cases.partnerId, count: sql<number>`count(*)::int` })
          .from(t.cases)
          .where(sql`${t.cases.partnerId} IS NOT NULL`)
          .groupBy(t.cases.partnerId);
        return new Map(rows.map((row) => [row.partnerId!, row.count]));
      },
    },

    verification: {
      byId: async (id, lock) => first(await locked(x.select().from(t.verificationTasks).where(eq(t.verificationTasks.id, id)).limit(1).$dynamic(), lock)),
      openForCase: async (caseId) =>
        first(
          await x
            .select()
            .from(t.verificationTasks)
            .where(and(eq(t.verificationTasks.caseId, caseId), ne(t.verificationTasks.status, 'completed'), ne(t.verificationTasks.status, 'cancelled')))
            .limit(1),
        ),
      list: async (filter) => {
        const conditions: SQL[] = [];
        if (filter?.auditorId) conditions.push(eq(t.verificationTasks.auditorId, filter.auditorId));
        if (filter?.open === true) conditions.push(inArray(t.verificationTasks.status, ['assigned', 'scheduled']));
        if (filter?.open === false) conditions.push(inArray(t.verificationTasks.status, ['completed', 'cancelled']));
        return x
          .select()
          .from(t.verificationTasks)
          .where(and(...conditions))
          .orderBy(desc(t.verificationTasks.createdAt));
      },
      insert: async (row) => {
        await x.insert(t.verificationTasks).values(row);
      },
      update: async (id, patch) => {
        await x.update(t.verificationTasks).set(patch).where(eq(t.verificationTasks.id, id));
      },
    },

    // ------------------------------------------------------------------ donations
    donations: {
      byId: async (id, lock) => {
        const row = first(await locked(x.select().from(t.donations).where(eq(t.donations.id, id)).limit(1).$dynamic(), lock));
        return row ? toDonation(row) : null;
      },
      byReceipt: async (receiptNo, lock) => {
        const row = first(await locked(x.select().from(t.donations).where(eq(t.donations.receiptNo, receiptNo)).limit(1).$dynamic(), lock));
        return row ? toDonation(row) : null;
      },
      byIdempotencyKey: async (key) => {
        const row = first(await x.select().from(t.donations).where(eq(t.donations.idempotencyKey, key)).limit(1));
        return row ? toDonation(row) : null;
      },
      insert: async (row) => {
        await x.insert(t.donations).values({ ...row, fxRate: String(row.fxRate) });
      },
      update: async (id, patch) => {
        const { fxRate, ...rest } = patch;
        await x
          .update(t.donations)
          .set({ ...rest, ...(fxRate === undefined ? {} : { fxRate: String(fxRate) }), updatedAt: new Date() })
          .where(eq(t.donations.id, id));
      },
      nextReceiptSequence: async (year) => {
        const [row] = await x
          .insert(t.receiptCounters)
          .values({ year, lastValue: 1 })
          .onConflictDoUpdate({ target: t.receiptCounters.year, set: { lastValue: sql`${t.receiptCounters.lastValue} + 1` } })
          .returning({ value: t.receiptCounters.lastValue });
        return row!.value;
      },
      forDonor: async (donorId, limit) =>
        (await x.select().from(t.donations).where(eq(t.donations.donorId, donorId)).orderBy(desc(t.donations.createdAt)).limit(limit)).map(toDonation),
      recentForCase: async (caseId, limit) =>
        (
          await x
            .select()
            .from(t.donations)
            .where(and(eq(t.donations.caseId, caseId), eq(t.donations.status, 'succeeded')))
            .orderBy(desc(t.donations.succeededAt))
            .limit(limit)
        ).map(toDonation),
      contactsForCase: async (caseId) => {
        const who = sql`coalesce(${t.donations.donorId}::text, ${t.donations.guestContact} ->> 'email', ${t.donations.guestContact} ->> 'phone', ${t.donations.id}::text)`;
        const rows = await x
          .selectDistinctOn([who], {
            id: t.donations.id,
            donorId: t.donations.donorId,
            guestContact: t.donations.guestContact,
            contactChannel: t.donations.contactChannel,
            locale: t.donations.locale,
          })
          .from(t.donations)
          .where(and(eq(t.donations.caseId, caseId), inArray(t.donations.status, ['succeeded', 'partially_refunded'])))
          // Each donor's latest gift: its channel and contact are the most recent preference.
          .orderBy(who, desc(t.donations.createdAt));
        return rows.map((row) => ({ ...row, contactChannel: row.contactChannel ?? null }));
      },
      list: async ({ status, limit }) =>
        (
          await x
            .select()
            .from(t.donations)
            .where(status ? eq(t.donations.status, status) : undefined)
            .orderBy(desc(t.donations.createdAt))
            .limit(limit)
        ).map(toDonation),
      expirable: async (before, limit) =>
        (
          await x
            .select()
            .from(t.donations)
            .where(and(inArray(t.donations.status, ['pending', 'requires_action', 'awaiting_transfer']), lte(t.donations.expiresAt, before)))
            .limit(limit)
        ).map(toDonation),
      latestAttempt: async (donationId) =>
        first(
          await x.select().from(t.paymentAttempts).where(eq(t.paymentAttempts.donationId, donationId)).orderBy(desc(t.paymentAttempts.createdAt)).limit(1),
        ) as PaymentAttemptRow | null,
      attemptByProviderRef: async (provider, providerRef) =>
        first(
          await x
            .select()
            .from(t.paymentAttempts)
            .where(and(eq(t.paymentAttempts.provider, provider), eq(t.paymentAttempts.providerRef, providerRef)))
            .limit(1),
        ) as PaymentAttemptRow | null,
      attemptByOrderRef: async (provider, providerOrderRef) =>
        first(
          await x
            .select()
            .from(t.paymentAttempts)
            .where(and(eq(t.paymentAttempts.provider, provider), eq(t.paymentAttempts.providerOrderRef, providerOrderRef)))
            .limit(1),
        ) as PaymentAttemptRow | null,
      insertAttempt: async (row) => {
        await x.insert(t.paymentAttempts).values(row);
      },
      updateAttempt: async (id, patch) => {
        await x.update(t.paymentAttempts).set(patch).where(eq(t.paymentAttempts.id, id));
      },
    },

    webhooks: {
      record: async (row) => {
        const inserted = await x
          .insert(t.webhookEvents)
          .values(row)
          .onConflictDoNothing({ target: [t.webhookEvents.provider, t.webhookEvents.eventId] })
          .returning({ id: t.webhookEvents.id });
        return inserted.length > 0;
      },
      finish: async (provider, eventId, error, at) => {
        await x
          .update(t.webhookEvents)
          .set({ processedAt: at, error })
          .where(and(eq(t.webhookEvents.provider, provider), eq(t.webhookEvents.eventId, eventId)));
      },
    },

    // ------------------------------------------------------------------ ledger
    ledger: {
      post: async (entry) => {
        for (const code of new Set(entry.lines.map((line) => line.account))) {
          const caseId = code.startsWith('liability:case:') ? code.slice('liability:case:'.length) : null;
          const lineCurrency = entry.lines.find((line) => line.account === code)!.currency;
          await x
            .insert(t.ledgerAccounts)
            .values({ code, type: accountType(code), currency: caseId ? lineCurrency : (FIXED_CURRENCY[code] ?? null), caseId })
            .onConflictDoNothing({ target: t.ledgerAccounts.code });
        }
        const [created] = await x
          .insert(t.journalEntries)
          .values({
            kind: entry.kind,
            memo: entry.memo ?? null,
            donationId: entry.donationId ?? null,
            payoutId: entry.payoutId ?? null,
            refundId: entry.refundId ?? null,
            postedBy: entry.postedBy ?? null,
            ...(entry.postedAt ? { postedAt: entry.postedAt } : {}),
          })
          .returning({ id: t.journalEntries.id });
        await x.insert(t.journalLines).values(
          entry.lines.map((line) => ({
            entryId: created!.id,
            accountCode: line.account,
            direction: line.direction,
            amountMinor: line.amountMinor,
            currency: line.currency,
            memo: line.memo ?? null,
          })),
        );
        return created!.id;
      },
      ensureCaseFund: async (caseId, currency) => {
        const code = `liability:case:${caseId}`;
        await x.insert(t.ledgerAccounts).values({ code, type: 'liability', currency, caseId }).onConflictDoNothing({ target: t.ledgerAccounts.code });
        return code;
      },
      caseFund: async (caseId) => {
        const result = await x.execute(
          sql`select case_id, currency, raised_minor, refunded_minor, disbursed_minor, held_minor from case_fund_summary where case_id = ${caseId}`,
        );
        return (result.rows as Array<Record<string, unknown>>).map((row): CaseFundSummary => ({
          caseId: String(row['case_id']),
          currency: row['currency'] as Currency,
          raisedMinor: Number(row['raised_minor']),
          refundedMinor: Number(row['refunded_minor']),
          disbursedMinor: Number(row['disbursed_minor']),
          heldMinor: Number(row['held_minor']),
        }));
      },
      lines: async ({ limit, kind, accountPrefix }) => {
        const conditions: SQL[] = [];
        if (kind) conditions.push(eq(t.journalEntries.kind, kind));
        if (accountPrefix) conditions.push(sql`${t.journalLines.accountCode} LIKE ${`${escapeLike(accountPrefix)}%`}`);
        const rows = await x
          .select({
            id: t.journalLines.id,
            entryId: t.journalLines.entryId,
            account: t.journalLines.accountCode,
            direction: t.journalLines.direction,
            amountMinor: t.journalLines.amountMinor,
            currency: t.journalLines.currency,
            memo: t.journalLines.memo,
            kind: t.journalEntries.kind,
            postedAt: t.journalEntries.postedAt,
            reference: sql<string | null>`coalesce(${t.donations.receiptNo}, ${t.payouts.reference}, ${t.journalEntries.memo})`,
          })
          .from(t.journalLines)
          .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
          .leftJoin(t.donations, eq(t.donations.id, t.journalEntries.donationId))
          .leftJoin(t.payouts, eq(t.payouts.id, t.journalEntries.payoutId))
          .where(and(...conditions))
          .orderBy(desc(t.journalLines.id))
          .limit(limit);
        return rows.map((row) => ({ ...row, memo: row.memo ?? undefined })) as JournalLineRow[];
      },
      balance: async (account, currency) => {
        const [row] = await x
          .select({
            total: sql<string>`coalesce(sum(case when ${t.journalLines.direction} = 'debit' then ${t.journalLines.amountMinor} else -${t.journalLines.amountMinor} end), 0)`,
          })
          .from(t.journalLines)
          .where(and(eq(t.journalLines.accountCode, account), eq(t.journalLines.currency, currency)));
        const signed = Number(row?.total ?? 0);
        return ['asset', 'expense'].includes(accountType(account)) ? signed : -signed;
      },
    },

    // ------------------------------------------------------------------ payouts & refunds
    payouts: {
      byId: async (id, lock) => first(await locked(x.select().from(t.payouts).where(eq(t.payouts.id, id)).limit(1).$dynamic(), lock)),
      forCase: async (caseId) => x.select().from(t.payouts).where(eq(t.payouts.caseId, caseId)).orderBy(asc(t.payouts.createdAt)),
      list: async (filter) =>
        x
          .select()
          .from(t.payouts)
          .where(filter?.status ? eq(t.payouts.status, filter.status) : undefined)
          .orderBy(desc(t.payouts.createdAt)),
      insert: async (row) => {
        await x.insert(t.payouts).values(row);
      },
      update: async (id, patch) => {
        await x.update(t.payouts).set(patch).where(eq(t.payouts.id, id));
      },
    },

    refunds: {
      byId: async (id, lock) => first(await locked(x.select().from(t.refunds).where(eq(t.refunds.id, id)).limit(1).$dynamic(), lock)),
      forDonation: async (donationId) => x.select().from(t.refunds).where(eq(t.refunds.donationId, donationId)).orderBy(asc(t.refunds.createdAt)),
      list: async (filter) =>
        x
          .select()
          .from(t.refunds)
          .where(filter?.status ? eq(t.refunds.status, filter.status) : undefined)
          .orderBy(desc(t.refunds.createdAt)),
      insert: async (row) => {
        await x.insert(t.refunds).values(row);
      },
      update: async (id, patch) => {
        await x.update(t.refunds).set(patch).where(eq(t.refunds.id, id));
      },
    },

    // ------------------------------------------------------------------ outbox, audit, notifications
    outbox: {
      enqueue: async (event) => {
        await x.insert(t.outboxEvents).values({
          type: event.type,
          aggregateId: event.aggregateId,
          payload: event.payload,
          ...(event.availableAt ? { availableAt: event.availableAt } : {}),
        });
      },
      claim: async (limit, now) => {
        // SKIP LOCKED: concurrent workers each take different rows.
        const due = await x
          .select({ id: t.outboxEvents.id })
          .from(t.outboxEvents)
          .where(and(eq(t.outboxEvents.status, 'pending'), lte(t.outboxEvents.availableAt, now)))
          .orderBy(asc(t.outboxEvents.id))
          .limit(limit)
          .for('update', { skipLocked: true });
        if (!due.length) return [];
        const rows = await x
          .update(t.outboxEvents)
          .set({ status: 'processing', attempts: sql`${t.outboxEvents.attempts} + 1` })
          .where(
            inArray(
              t.outboxEvents.id,
              due.map((row) => row.id),
            ),
          )
          .returning();
        return rows.sort((a, b) => a.id - b.id) as OutboxRow[];
      },
      markSent: async (id) => {
        await x.update(t.outboxEvents).set({ status: 'sent' }).where(eq(t.outboxEvents.id, id));
      },
      markFailed: async (id, error, retryAt) => {
        await x
          .update(t.outboxEvents)
          .set({ status: retryAt ? 'pending' : 'failed', lastError: error, ...(retryAt ? { availableAt: retryAt } : {}) })
          .where(eq(t.outboxEvents.id, id));
      },
    },

    audit: {
      record: async (entry) => {
        await x.insert(t.auditLogs).values({
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: entry.before ?? null,
          after: entry.after ?? null,
          ip: entry.ip ?? null,
          requestId: entry.requestId ?? null,
          ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
        });
      },
      list: async ({ limit, entityType, entityId }) =>
        x
          .select()
          .from(t.auditLogs)
          .where(and(entityType ? eq(t.auditLogs.entityType, entityType) : undefined, entityId ? eq(t.auditLogs.entityId, entityId) : undefined))
          .orderBy(desc(t.auditLogs.id))
          .limit(limit),
    },

    reports: reportsRepo(x),

    notifications: {
      insert: async (row) => {
        await x.insert(t.notifications).values(row).onConflictDoNothing({ target: t.notifications.id });
      },
      forUser: async (userId, limit) =>
        x.select().from(t.notifications).where(eq(t.notifications.userId, userId)).orderBy(desc(t.notifications.createdAt)).limit(limit),
      markRead: async (userId, ids, at) => {
        if (!ids.length) return;
        await x
          .update(t.notifications)
          .set({ readAt: at })
          .where(and(eq(t.notifications.userId, userId), inArray(t.notifications.id, [...ids]), isNull(t.notifications.readAt)));
      },
    },
  };
}

/** Converts a case-currency (or charge-currency) column to EGP minor units with the given rates. */
function inEgp(
  column: SQL | typeof t.donations.netToCaseMinor,
  currencyColumn: typeof t.donations.caseCurrency | typeof t.donations.currency,
  rates: RatesToEgp,
): SQL {
  return sql`round(${column} * CASE ${currencyColumn} WHEN 'EGP' THEN ${rates.EGP}::numeric WHEN 'SAR' THEN ${rates.SAR}::numeric ELSE ${rates.USD}::numeric END)`;
}

function reportsRepo(x: Executor): Tx['reports'] {
  const creditedSince = (since: Date) => and(inArray(t.donations.status, ['succeeded', 'partially_refunded']), gte(t.donations.succeededAt, since));
  return {
    donationTotals: async (since, rates) => {
      const [row] = await x
        .select({
          count: sql<number>`count(*)::int`,
          amount: sql<string>`coalesce(sum(${inEgp(t.donations.netToCaseMinor, t.donations.caseCurrency, rates)}), 0)`,
          fees: sql<string>`coalesce(sum(${inEgp(sql`coalesce(${t.donations.feeMinor}, 0)`, t.donations.currency, rates)}), 0)`,
        })
        .from(t.donations)
        .where(creditedSince(since));
      return { count: row?.count ?? 0, amountEgpMinor: Number(row?.amount ?? 0), feesEgpMinor: Number(row?.fees ?? 0) };
    },
    dailySeries: async (since, rates) => {
      const day = sql<string>`to_char(${t.donations.succeededAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
      const rows = await x
        .select({
          date: day,
          amount: sql<string>`sum(${inEgp(t.donations.netToCaseMinor, t.donations.caseCurrency, rates)})`,
          count: sql<number>`count(*)::int`,
        })
        .from(t.donations)
        .where(creditedSince(since))
        .groupBy(day)
        .orderBy(day);
      return rows.map((row) => ({ date: row.date, amountMinor: Number(row.amount), count: row.count }));
    },
    byMethod: async (since, rates) => {
      const rows = await x
        .select({
          method: t.donations.method,
          amount: sql<string>`sum(${inEgp(t.donations.netToCaseMinor, t.donations.caseCurrency, rates)})`,
          count: sql<number>`count(*)::int`,
        })
        .from(t.donations)
        .where(creditedSince(since))
        .groupBy(t.donations.method);
      return rows.map((row) => ({ method: row.method, amountMinor: Number(row.amount), count: row.count })).sort((a, b) => b.amountMinor - a.amountMinor);
    },
    byCategory: async (since, rates) => {
      const rows = await x
        .select({ category: t.cases.category, amount: sql<string>`sum(${inEgp(t.donations.netToCaseMinor, t.donations.caseCurrency, rates)})` })
        .from(t.donations)
        .innerJoin(t.cases, eq(t.cases.id, t.donations.caseId))
        .where(creditedSince(since))
        .groupBy(t.cases.category);
      return rows.map((row) => ({ category: row.category, amountMinor: Number(row.amount) })).sort((a, b) => b.amountMinor - a.amountMinor);
    },
    caseCounts: async () => {
      const rows = await x
        .select({ status: t.cases.status, count: sql<number>`count(*)::int` })
        .from(t.cases)
        .groupBy(t.cases.status);
      return Object.fromEntries(rows.map((row) => [row.status, row.count]));
    },
    donationCounts: async () => {
      const rows = await x
        .select({ status: t.donations.status, count: sql<number>`count(*)::int` })
        .from(t.donations)
        .groupBy(t.donations.status);
      return Object.fromEntries(rows.map((row) => [row.status, row.count]));
    },
    medianHoursToFund: async () => {
      const [row] = await x
        .select({
          hours: sql<string | null>`percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ${t.cases.fundedAt} - ${t.cases.publishedAt}) / 3600)`,
        })
        .from(t.cases)
        .where(sql`${t.cases.fundedAt} IS NOT NULL AND ${t.cases.publishedAt} IS NOT NULL`);
      return Math.round(Number(row?.hours ?? 0));
    },
    donors: async (rates) => {
      const rows = await x
        .select({
          donorId: t.donations.donorId,
          donationsCount: sql<number>`count(*)::int`,
          given: sql<string>`sum(${inEgp(t.donations.netToCaseMinor, t.donations.caseCurrency, rates)})`,
          firstAt: sql<Date>`min(${t.donations.succeededAt})`,
          lastAt: sql<Date>`max(${t.donations.succeededAt})`,
        })
        .from(t.donations)
        .where(and(inArray(t.donations.status, ['succeeded', 'partially_refunded']), sql`${t.donations.donorId} IS NOT NULL`))
        .groupBy(t.donations.donorId)
        .orderBy(sql`4 DESC`);
      return rows.map((row) => ({
        donorId: row.donorId!,
        donationsCount: row.donationsCount,
        givenEgpMinor: Number(row.given),
        firstAt: new Date(row.firstAt),
        lastAt: new Date(row.lastAt),
      }));
    },
    volunteers: async () => {
      const rows = await x
        .select({
          userId: t.volunteerProfiles.userId,
          status: t.volunteerProfiles.status,
          region: t.volunteerProfiles.region,
          joinedAt: t.volunteerProfiles.joinedAt,
          casesSubmitted: sql<number>`(select count(*)::int from cases c where c.submitted_by = ${t.volunteerProfiles.userId})`,
          visitsDone: sql<number>`(select count(*)::int from verification_tasks v where v.auditor_id = ${t.volunteerProfiles.userId} and v.status = 'completed')`,
        })
        .from(t.volunteerProfiles);
      return rows;
    },
  };
}
