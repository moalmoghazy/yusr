/**
 * In-memory implementation of the persistence ports.
 *
 * Used by the unit tests and by `YUSR_STORAGE=memory` (run the whole API without
 * PostgreSQL or Redis). It deliberately enforces the same invariants as the SQL
 * schema — balanced entries, non-negative case funds, allowed status transitions,
 * four-eyes approvals, idempotency and webhook uniqueness — so a rule cannot pass
 * the tests here and then fail in production.
 *
 * Transactions are serialized and roll back by restoring a snapshot on error.
 */
import { CASE_TRANSITIONS, DomainError, accountType, assertBalanced, queryCases, type CaseStatus, type Currency, type PaymentProvider } from '@yusr/core';
import { toCaseSummary } from '../cases/mappers';
import type {
  AuditRepo,
  CasePage,
  CasesRepo,
  Database,
  DonationsRepo,
  LedgerRepo,
  NotificationsRepo,
  OutboxRepo,
  PartnersRepo,
  PayoutsRepo,
  RefreshTokensRepo,
  RatesToEgp,
  RefundsRepo,
  ReportsRepo,
  Tx,
  UsersRepo,
  VerificationRepo,
  WebhooksRepo,
} from './ports';
import type {
  AuditRow,
  AuthIdentityRow,
  BeneficiaryRow,
  CaseDocumentRow,
  CaseFundSummary,
  CaseRow,
  CaseTransitionRow,
  DisbursementLineRow,
  DonationRow,
  EntryKind,
  Id,
  JournalLineRow,
  NotificationRow,
  OutboxRow,
  PartnerApplicationRow,
  PartnerRow,
  PaymentAttemptRow,
  PayoutRow,
  RefreshTokenRow,
  RefundRow,
  UserRow,
  VerificationTaskRow,
  VolunteerProfileRow,
  WebhookEventRow,
} from './rows';

interface AccountRow {
  code: string;
  type: ReturnType<typeof accountType>;
  currency: Currency | null;
  caseId: Id | null;
}

interface EntryRow {
  id: Id;
  kind: EntryKind;
  memo: string | null;
  donationId: Id | null;
  payoutId: Id | null;
  refundId: Id | null;
  postedBy: Id | null;
  postedAt: Date;
}

interface State {
  users: Map<Id, UserRow>;
  volunteers: Map<Id, VolunteerProfileRow>;
  identities: AuthIdentityRow[];
  refreshTokens: Map<Id, RefreshTokenRow>;
  beneficiaries: Map<Id, BeneficiaryRow>;
  partners: Map<Id, PartnerRow>;
  partnerApplications: Map<Id, PartnerApplicationRow>;
  cases: Map<Id, CaseRow>;
  transitions: CaseTransitionRow[];
  documents: Map<Id, CaseDocumentRow>;
  lines: Map<Id, DisbursementLineRow>;
  tasks: Map<Id, VerificationTaskRow>;
  donations: Map<Id, DonationRow>;
  receiptCounters: Map<number, number>;
  attempts: Map<Id, PaymentAttemptRow>;
  webhooks: Map<string, WebhookEventRow>;
  accounts: Map<string, AccountRow>;
  entries: Map<Id, EntryRow>;
  journal: JournalLineRow[];
  payouts: Map<Id, PayoutRow>;
  refunds: Map<Id, RefundRow>;
  outbox: OutboxRow[];
  audit: AuditRow[];
  notifications: Map<Id, NotificationRow>;
  seq: { caseReference: number; journalLine: number; transition: number; outbox: number; audit: number };
}

const PLATFORM_ACCOUNTS: ReadonlyArray<[string, Currency | null]> = [
  ['asset:bank:operating', null],
  ['asset:clearing:paymob', 'EGP'],
  ['asset:clearing:fawry', 'EGP'],
  ['asset:clearing:instapay', 'EGP'],
  ['asset:clearing:moyasar', 'SAR'],
  ['asset:clearing:stripe', 'USD'],
  ['expense:gateway_fees', null],
  ['revenue:fee_recovery', null],
  ['revenue:platform_fees', null],
  ['equity:fx:EGP', 'EGP'],
  ['equity:fx:SAR', 'SAR'],
  ['equity:fx:USD', 'USD'],
];

function emptyState(): State {
  const accounts = new Map<string, AccountRow>();
  for (const [code, currency] of PLATFORM_ACCOUNTS) accounts.set(code, { code, type: accountType(code), currency, caseId: null });
  return {
    users: new Map(),
    volunteers: new Map(),
    identities: [],
    refreshTokens: new Map(),
    beneficiaries: new Map(),
    partners: new Map(),
    partnerApplications: new Map(),
    cases: new Map(),
    transitions: [],
    documents: new Map(),
    lines: new Map(),
    tasks: new Map(),
    donations: new Map(),
    receiptCounters: new Map(),
    attempts: new Map(),
    webhooks: new Map(),
    accounts,
    entries: new Map(),
    journal: [],
    payouts: new Map(),
    refunds: new Map(),
    outbox: [],
    audit: [],
    notifications: new Map(),
    seq: { caseReference: 10_500, journalLine: 0, transition: 0, outbox: 0, audit: 0 },
  };
}

const clone = <T>(value: T): T => structuredClone(value);
const cloneAll = <T>(values: Iterable<T>): T[] => [...values].map(clone);

function patchRow<T extends object>(map: Map<Id, T>, id: Id, patch: Partial<T>, label: string): T {
  const row = map.get(id);
  if (!row) throw new DomainError('NOT_FOUND', `${label} ${id} not found`);
  const next = { ...row, ...patch };
  map.set(id, next);
  return next;
}

const RULES = new Map(CASE_TRANSITIONS.map((rule) => [`${rule.from}>${rule.to}`, rule.permission === 'system']));

export class MemoryDatabase implements Database {
  private state: State = emptyState();
  private queue: Promise<unknown> = Promise.resolve();
  private seeding = false;
  readonly read: Tx;

  constructor(private readonly clock: () => Date = () => new Date()) {
    this.read = this.createTx();
  }

  async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const run = async () => {
      const snapshot = clone(this.state);
      try {
        return await work(this.read);
      } catch (error) {
        this.state = snapshot;
        throw error;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Inserts demo or fixture data, allowing cases to start in any status (like the SQL `seed` flag). */
  async seed(work: (tx: Tx) => Promise<void>): Promise<void> {
    this.seeding = true;
    try {
      await this.transaction(work);
    } finally {
      this.seeding = false;
    }
  }

  /** Test helper: a copy of the raw journal. */
  journalLines(): JournalLineRow[] {
    return cloneAll(this.state.journal);
  }

  outboxEvents(): OutboxRow[] {
    return cloneAll(this.state.outbox);
  }

  auditRows(): AuditRow[] {
    return cloneAll(this.state.audit);
  }

  private createTx(): Tx {
    return {
      users: this.usersRepo(),
      refreshTokens: this.refreshTokensRepo(),
      cases: this.casesRepo(),
      partners: this.partnersRepo(),
      verification: this.verificationRepo(),
      donations: this.donationsRepo(),
      webhooks: this.webhooksRepo(),
      ledger: this.ledgerRepo(),
      payouts: this.payoutsRepo(),
      refunds: this.refundsRepo(),
      outbox: this.outboxRepo(),
      audit: this.auditRepo(),
      notifications: this.notificationsRepo(),
      reports: this.reportsRepo(),
    };
  }

  // ------------------------------------------------------------------ approved partners
  private partnersRepo(): PartnersRepo {
    const s = () => this.state;
    const assertUnique = (row: PartnerRow) => {
      for (const other of s().partners.values()) {
        if (other.id === row.id) continue;
        if (other.registrationNumber === row.registrationNumber) throw new DomainError('VALIDATION_FAILED', 'This record already exists');
        if (other.codeHash === row.codeHash) throw new DomainError('VALIDATION_FAILED', 'This record already exists');
      }
      if ((row.status === 'suspended') !== (row.suspendedAt !== null)) throw new DomainError('VALIDATION_FAILED', 'suspended partners carry suspendedAt');
    };
    return {
      byId: async (id) => clone(s().partners.get(id) ?? null),
      byRegistrationNumber: async (registrationNumber) =>
        clone([...s().partners.values()].find((row) => row.registrationNumber === registrationNumber) ?? null),
      byCodeHash: async (codeHash) => clone([...s().partners.values()].find((row) => row.codeHash === codeHash) ?? null),
      list: async () => cloneAll([...s().partners.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
      insert: async (row) => {
        if (s().partners.has(row.id)) throw new DomainError('VALIDATION_FAILED', 'This record already exists');
        assertUnique(row);
        s().partners.set(row.id, clone(row));
      },
      update: async (id, patch) => {
        const current = s().partners.get(id);
        if (!current) throw new DomainError('NOT_FOUND', `partner ${id} not found`);
        const next: PartnerRow = { ...current, ...clone(patch), updatedAt: this.clock() };
        assertUnique(next);
        s().partners.set(id, next);
        // Like partners_sync_cases in 0006: the registry's name and number follow onto its cases.
        if (next.name !== current.name || next.registrationNumber !== current.registrationNumber) {
          for (const item of s().cases.values()) {
            if (item.partnerId === id && item.association)
              item.association = { ...item.association, name: next.name, registrationNumber: next.registrationNumber };
          }
        }
      },
      caseCounts: async () => {
        const counts = new Map<Id, number>();
        for (const item of s().cases.values()) if (item.partnerId) counts.set(item.partnerId, (counts.get(item.partnerId) ?? 0) + 1);
        return counts;
      },
      applications: async (limit) =>
        cloneAll([...s().partnerApplications.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit)),
      applicationById: async (id) => clone(s().partnerApplications.get(id) ?? null),
      insertApplication: async (row) => {
        if (s().partnerApplications.has(row.id)) throw new DomainError('VALIDATION_FAILED', 'This record already exists');
        s().partnerApplications.set(row.id, clone(row));
      },
      updateApplication: async (id, patch) => {
        const current = s().partnerApplications.get(id);
        if (!current) throw new DomainError('NOT_FOUND', `partner application ${id} not found`);
        // Like partner_applications_handled in 0009.
        if ((patch.status === 'new') !== (patch.handledAt === null)) throw new DomainError('VALIDATION_FAILED', 'handled requests carry handledAt');
        s().partnerApplications.set(id, { ...current, ...clone(patch) });
      },
    };
  }

  // ------------------------------------------------------------------ users & auth
  private usersRepo(): UsersRepo {
    const s = () => this.state;
    return {
      byId: async (id) => clone(s().users.get(id) ?? null),
      byPhone: async (phone) => clone([...s().users.values()].find((user) => user.phone === phone) ?? null),
      byEmail: async (email) => clone([...s().users.values()].find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null),
      insert: async (row) => {
        const users = [...s().users.values()];
        if (row.phone && users.some((user) => user.phone === row.phone)) throw new DomainError('VALIDATION_FAILED', 'phone already registered');
        if (row.email && users.some((user) => user.email?.toLowerCase() === row.email?.toLowerCase())) {
          throw new DomainError('VALIDATION_FAILED', 'email already registered');
        }
        s().users.set(row.id, clone(row));
      },
      update: async (id, patch) => {
        patchRow(s().users, id, { ...patch, updatedAt: this.clock() }, 'user');
      },
      claimTotpStep: async (id, step) => {
        const user = s().users.get(id);
        if (!user || ((user.totpLastStep ?? null) !== null && user.totpLastStep! >= step)) return false;
        user.totpLastStep = step;
        return true;
      },
      staff: async () =>
        cloneAll(
          [...s().users.values()].filter((user) =>
            user.roles.some((role) => ['field_auditor', 'content_moderator', 'financial_officer', 'super_admin'].includes(role)),
          ),
        ),
      identity: async (provider, subject) => clone(s().identities.find((row) => row.provider === provider && row.subject === subject) ?? null),
      insertIdentity: async (row) => {
        if (s().identities.some((item) => item.provider === row.provider && item.subject === row.subject)) {
          throw new DomainError('VALIDATION_FAILED', 'identity already linked');
        }
        s().identities.push(clone(row));
      },
      insertVolunteer: async (row) => {
        s().volunteers.set(row.userId, clone(row));
      },
    };
  }

  private refreshTokensRepo(): RefreshTokensRepo {
    const s = () => this.state;
    return {
      byHash: async (hash) => clone([...s().refreshTokens.values()].find((row) => row.tokenHash === hash) ?? null),
      insert: async (row) => {
        s().refreshTokens.set(row.id, clone(row));
      },
      markReplaced: async (id, replacedBy, at) => {
        patchRow(s().refreshTokens, id, { replacedBy, revokedAt: at }, 'refresh token');
      },
      revokeFamily: async (familyId, at) => {
        let count = 0;
        for (const row of s().refreshTokens.values()) {
          if (row.familyId === familyId && !row.revokedAt) {
            row.revokedAt = at;
            count += 1;
          }
        }
        return count;
      },
      revokeAllForUser: async (userId, at) => {
        let count = 0;
        for (const row of s().refreshTokens.values()) {
          if (row.userId === userId && !row.revokedAt) {
            row.revokedAt = at;
            count += 1;
          }
        }
        return count;
      },
    };
  }

  // ------------------------------------------------------------------ cases
  private casesRepo(): CasesRepo {
    const s = () => this.state;
    return {
      byId: async (id) => clone(s().cases.get(id) ?? null),
      bySlug: async (slug) => clone([...s().cases.values()].find((row) => row.slug === slug) ?? null),
      search: async (filters): Promise<CasePage> => {
        const rows = [...s().cases.values()].filter((row) => filters.statuses.includes(row.status));
        const page = queryCases(rows.map(toCaseSummary), { ...filters, includeFunded: true });
        return {
          items: page.items.map((item) => clone(s().cases.get(item.id)!)),
          total: page.total,
          nextCursor: page.nextCursor,
        };
      },
      insert: async (row) => {
        if (!this.seeding && row.status !== 'draft' && row.status !== 'under_review') {
          throw new DomainError('INVALID_TRANSITION', `new cases start as draft or under_review, not ${row.status}`);
        }
        if ([...s().cases.values()].some((item) => item.slug === row.slug)) throw new DomainError('VALIDATION_FAILED', 'slug taken');
        if (!row.submittedBy && !row.partnerId) throw new DomainError('VALIDATION_FAILED', 'a case needs a submitter or a partner');
        if (row.partnerId && row.submitterRelation !== 'association') throw new DomainError('VALIDATION_FAILED', 'only association cases name a partner');
        let association = row.association;
        // Like cases_partner_guard in 0006: an association case comes from an active partner, named as in the registry.
        if (row.submitterRelation === 'association') {
          const partner = row.partnerId ? s().partners.get(row.partnerId) : undefined;
          if (!partner) throw new DomainError('VALIDATION_FAILED', 'association cases need a partner from the registry');
          if (partner.status !== 'active') throw new DomainError('VALIDATION_FAILED', 'the partner is suspended');
          if (!association) throw new DomainError('VALIDATION_FAILED', 'association cases need a contact');
          association = { ...association, name: partner.name, registrationNumber: partner.registrationNumber };
        }
        const created: CaseRow = { ...clone(row), association, reference: row.reference ?? `YSR-${(s().seq.caseReference += 1)}` };
        s().cases.set(created.id, created);
        return clone(created);
      },
      update: async (id, patch) => {
        if (patch.status) throw new Error('Use setStatus() to change a case status');
        patchRow(s().cases, id, { ...patch, updatedAt: this.clock() }, 'case');
      },
      setStatus: async (id, to, options) => {
        const row = s().cases.get(id);
        if (!row) throw new DomainError('NOT_FOUND', `case ${id} not found`);
        if (row.status === to) return clone(row);
        const systemOnly = RULES.get(`${row.status}>${to}`);
        if (systemOnly === undefined) throw new DomainError('INVALID_TRANSITION', `case ${row.reference} cannot move from ${row.status} to ${to}`);
        if (systemOnly && !options?.system) throw new DomainError('FORBIDDEN_TRANSITION', `only the platform can move ${row.reference} to ${to}`);
        const now = this.clock();
        const next: CaseRow = { ...row, status: to, updatedAt: now };
        if (to === 'field_verified') next.verifiedAt = row.verifiedAt ?? now;
        if (to === 'published') next.publishedAt = row.publishedAt ?? now;
        if (to === 'funded') next.fundedAt = now;
        if (to === 'closed') next.closedAt = now;
        if ((to === 'published' || to === 'funded') && !next.verifiedAt) {
          throw new DomainError('INVALID_TRANSITION', 'published cases must be field verified');
        }
        s().cases.set(id, next);
        return clone(next);
      },
      credit: async (id, amountMinor, donors) => {
        const row = patchRow(s().cases, id, {}, 'case');
        row.raisedMinor += amountMinor;
        row.donorsCount += donors;
        if (row.raisedMinor < 0 || row.donorsCount < 0) throw new DomainError('VALIDATION_FAILED', 'case totals cannot go negative');
        row.updatedAt = this.clock();
        return { raisedMinor: row.raisedMinor, goalMinor: row.goalMinor, status: row.status, donorsCount: row.donorsCount };
      },
      insertTransition: async (row) => {
        s().transitions.push({ ...clone(row), id: (s().seq.transition += 1), createdAt: row.createdAt ?? this.clock() });
      },
      transitions: async (caseId) => cloneAll(s().transitions.filter((row) => row.caseId === caseId)),
      documents: async (caseId) => cloneAll([...s().documents.values()].filter((row) => row.caseId === caseId)),
      insertDocument: async (row) => {
        if (s().documents.has(row.id)) throw new DomainError('VALIDATION_FAILED', `document ${row.id} exists`);
        s().documents.set(row.id, clone(row));
      },
      updateDocument: async (id, patch) => {
        patchRow(s().documents, id, patch, 'document');
      },
      document: async (id) => clone(s().documents.get(id) ?? null),
      lines: async (caseId) => cloneAll([...s().lines.values()].filter((row) => row.caseId === caseId).sort((a, b) => a.position - b.position)),
      line: async (id) => clone(s().lines.get(id) ?? null),
      insertLines: async (rows) => {
        for (const row of rows) s().lines.set(row.id, clone(row));
      },
      beneficiary: async (id) => clone(s().beneficiaries.get(id) ?? null),
      beneficiaryByNationalIdHash: async (hash) => clone([...s().beneficiaries.values()].find((row) => row.nationalIdHash === hash) ?? null),
      insertBeneficiary: async (row) => {
        if (row.nationalIdHash && [...s().beneficiaries.values()].some((item) => item.nationalIdHash === row.nationalIdHash)) {
          throw new DomainError('VALIDATION_FAILED', 'beneficiary already registered');
        }
        s().beneficiaries.set(row.id, clone(row));
      },
    };
  }

  private verificationRepo(): VerificationRepo {
    const s = () => this.state;
    return {
      byId: async (id) => clone(s().tasks.get(id) ?? null),
      openForCase: async (caseId) =>
        clone([...s().tasks.values()].find((row) => row.caseId === caseId && row.status !== 'completed' && row.status !== 'cancelled') ?? null),
      list: async (filter) =>
        cloneAll(
          [...s().tasks.values()].filter(
            (row) =>
              (!filter?.auditorId || row.auditorId === filter.auditorId) &&
              (filter?.open === undefined || filter.open === (row.status !== 'completed' && row.status !== 'cancelled')),
          ),
        ),
      insert: async (row) => {
        const open = [...s().tasks.values()].some((item) => item.caseId === row.caseId && item.status !== 'completed' && item.status !== 'cancelled');
        if (open) throw new DomainError('VALIDATION_FAILED', 'case already has an open verification task');
        s().tasks.set(row.id, clone(row));
      },
      update: async (id, patch) => {
        const next = patchRow(s().tasks, id, patch, 'verification task');
        if (next.status === 'completed' && (!next.completedAt || next.recommendedMinor === null)) {
          throw new DomainError('VALIDATION_FAILED', 'completed tasks need a date and a recommended amount');
        }
      },
    };
  }

  // ------------------------------------------------------------------ donations & payments
  private donationsRepo(): DonationsRepo {
    const s = () => this.state;
    const all = () => [...s().donations.values()];
    // payment_attempts_ref and payment_attempts_order_ref (0004): one attempt per provider reference.
    const assertUniqueAttempt = (row: PaymentAttemptRow) => {
      for (const item of s().attempts.values()) {
        if (item.id === row.id || item.provider !== row.provider) continue;
        if (row.providerRef && item.providerRef === row.providerRef) throw new DomainError('VALIDATION_FAILED', 'duplicate provider reference');
        if (row.providerOrderRef && item.providerOrderRef === row.providerOrderRef) throw new DomainError('VALIDATION_FAILED', 'duplicate provider order');
      }
    };
    return {
      byId: async (id) => clone(s().donations.get(id) ?? null),
      byReceipt: async (receiptNo) => clone(all().find((row) => row.receiptNo === receiptNo) ?? null),
      byIdempotencyKey: async (key) => clone(all().find((row) => row.idempotencyKey === key) ?? null),
      insert: async (row) => {
        if (all().some((item) => item.idempotencyKey === row.idempotencyKey)) throw new DomainError('IDEMPOTENCY_CONFLICT', 'duplicate idempotency key');
        if (all().some((item) => item.receiptNo === row.receiptNo)) throw new DomainError('VALIDATION_FAILED', 'duplicate receipt number');
        if (!row.donorId && !row.guestContact) throw new DomainError('VALIDATION_FAILED', 'donation needs a donor or guest contact');
        // donations_contact_for_channel (0007): the chosen channel needs its contact.
        if (row.contactChannel === 'whatsapp' && !/^\+[1-9]\d{7,14}$/.test(row.guestContact?.phone ?? '')) {
          throw new DomainError('VALIDATION_FAILED', 'a WhatsApp preference needs a WhatsApp number');
        }
        if (row.contactChannel === 'email' && !/.@./.test(row.guestContact?.email ?? '')) {
          throw new DomainError('VALIDATION_FAILED', 'an email preference needs an email address');
        }
        s().donations.set(row.id, clone(row));
      },
      update: async (id, patch) => {
        const next = patchRow(s().donations, id, { ...patch, updatedAt: this.clock() }, 'donation');
        if (['succeeded', 'refunded', 'partially_refunded'].includes(next.status) && (!next.succeededAt || next.feeMinor === null)) {
          throw new DomainError('VALIDATION_FAILED', 'succeeded donations need a date and the actual fee');
        }
      },
      nextReceiptSequence: async (year) => {
        const next = (s().receiptCounters.get(year) ?? 0) + 1;
        s().receiptCounters.set(year, next);
        return next;
      },
      forDonor: async (donorId, limit) =>
        cloneAll(
          all()
            .filter((row) => row.donorId === donorId)
            .sort((a, b) => +b.createdAt - +a.createdAt)
            .slice(0, limit),
        ),
      recentForCase: async (caseId, limit) =>
        cloneAll(
          all()
            .filter((row) => row.caseId === caseId && row.status === 'succeeded')
            .sort((a, b) => +(b.succeededAt ?? 0) - +(a.succeededAt ?? 0))
            .slice(0, limit),
        ),
      list: async ({ status, limit }) =>
        cloneAll(
          all()
            .filter((row) => !status || row.status === status)
            .sort((a, b) => +b.createdAt - +a.createdAt)
            .slice(0, limit),
        ),
      contactsForCase: async (caseId) => {
        const seen = new Set<string>();
        const result: Array<Pick<DonationRow, 'donorId' | 'guestContact' | 'contactChannel' | 'locale' | 'id'>> = [];
        // Each donor's latest gift: its channel and contact are the most recent preference.
        for (const row of [...all()].sort((a, b) => +b.createdAt - +a.createdAt)) {
          if (row.caseId !== caseId || !['succeeded', 'partially_refunded'].includes(row.status)) continue;
          const who = row.donorId ?? row.guestContact?.email ?? row.guestContact?.phone ?? row.id;
          if (seen.has(who)) continue;
          seen.add(who);
          result.push(
            clone({ id: row.id, donorId: row.donorId, guestContact: row.guestContact, contactChannel: row.contactChannel ?? null, locale: row.locale }),
          );
        }
        return result;
      },
      expirable: async (before, limit) =>
        cloneAll(
          all()
            .filter((row) => ['pending', 'requires_action', 'awaiting_transfer'].includes(row.status) && row.expiresAt < before)
            .slice(0, limit),
        ),
      latestAttempt: async (donationId) =>
        clone([...s().attempts.values()].filter((row) => row.donationId === donationId).sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null),
      attemptByProviderRef: async (provider, providerRef) =>
        clone([...s().attempts.values()].find((row) => row.provider === provider && row.providerRef === providerRef) ?? null),
      attemptByOrderRef: async (provider, providerOrderRef) =>
        clone([...s().attempts.values()].find((row) => row.provider === provider && row.providerOrderRef === providerOrderRef) ?? null),
      insertAttempt: async (row) => {
        assertUniqueAttempt(row);
        s().attempts.set(row.id, clone(row));
      },
      updateAttempt: async (id, patch) => {
        const current = s().attempts.get(id);
        if (current) assertUniqueAttempt({ ...current, ...patch });
        patchRow(s().attempts, id, patch, 'payment attempt');
      },
    };
  }

  private webhooksRepo(): WebhooksRepo {
    const s = () => this.state;
    const key = (provider: PaymentProvider, eventId: string) => `${provider}:${eventId}`;
    return {
      record: async (row) => {
        const id = key(row.provider, row.eventId);
        if (s().webhooks.has(id)) return false;
        s().webhooks.set(id, clone(row));
        return true;
      },
      finish: async (provider, eventId, error, at) => {
        const row = s().webhooks.get(key(provider, eventId));
        if (row) Object.assign(row, { processedAt: at, error });
      },
    };
  }

  // ------------------------------------------------------------------ ledger
  private ledgerRepo(): LedgerRepo {
    const s = () => this.state;
    const ensureAccount = (code: string, currency: Currency) => {
      const existing = s().accounts.get(code);
      if (existing) return existing;
      const caseId = code.startsWith('liability:case:') ? code.slice('liability:case:'.length) : null;
      const account: AccountRow = { code, type: accountType(code), currency: caseId ? currency : null, caseId };
      s().accounts.set(code, account);
      return account;
    };
    const caseFunds = (caseId: Id): CaseFundSummary[] => {
      const code = `liability:case:${caseId}`;
      const byCurrency = new Map<Currency, CaseFundSummary>();
      for (const line of s().journal) {
        if (line.account !== code) continue;
        const summary =
          byCurrency.get(line.currency) ??
          ({ caseId, currency: line.currency, raisedMinor: 0, refundedMinor: 0, disbursedMinor: 0, heldMinor: 0 } satisfies CaseFundSummary);
        const signed = line.direction === 'credit' ? line.amountMinor : -line.amountMinor;
        summary.heldMinor += signed;
        if (line.kind === 'donation' && line.direction === 'credit') summary.raisedMinor += line.amountMinor;
        if (line.kind === 'refund' && line.direction === 'debit') summary.refundedMinor += line.amountMinor;
        if (line.kind === 'payout' && line.direction === 'debit') summary.disbursedMinor += line.amountMinor;
        byCurrency.set(line.currency, summary);
      }
      return [...byCurrency.values()];
    };
    return {
      post: async (entry) => {
        if (entry.lines.length < 2) throw new DomainError('LEDGER_UNBALANCED', 'a journal entry needs at least two lines');
        if (entry.lines.some((line) => !Number.isInteger(line.amountMinor) || line.amountMinor <= 0)) {
          throw new DomainError('LEDGER_UNBALANCED', 'line amounts must be positive integers');
        }
        assertBalanced(entry.lines);
        const duplicate = [...s().entries.values()].some(
          (row) =>
            (entry.kind === 'donation' && row.kind === 'donation' && row.donationId === entry.donationId) ||
            (entry.kind === 'payout' && row.kind === 'payout' && row.payoutId === entry.payoutId) ||
            (entry.kind === 'refund' && row.kind === 'refund' && row.refundId === entry.refundId),
        );
        if (duplicate) throw new DomainError('VALIDATION_FAILED', `a ${entry.kind} entry was already posted for this source`);
        for (const line of entry.lines) {
          const account = ensureAccount(line.account, line.currency);
          if (account.currency && account.currency !== line.currency) {
            throw new DomainError('CURRENCY_MISMATCH', `account ${line.account} only holds ${account.currency}`);
          }
        }
        const id = `je_${String(s().entries.size + 1).padStart(8, '0')}`;
        const postedAt = entry.postedAt ?? this.clock();
        const reference =
          (entry.donationId && s().donations.get(entry.donationId)?.receiptNo) ??
          (entry.payoutId && s().payouts.get(entry.payoutId)?.reference) ??
          (entry.refundId ? `RF-${entry.refundId.slice(-6)}` : null);
        s().entries.set(id, {
          id,
          kind: entry.kind,
          memo: entry.memo ?? null,
          donationId: entry.donationId ?? null,
          payoutId: entry.payoutId ?? null,
          refundId: entry.refundId ?? null,
          postedBy: entry.postedBy ?? null,
          postedAt,
        });
        for (const line of entry.lines) {
          s().journal.push({ ...clone(line), id: (s().seq.journalLine += 1), entryId: id, kind: entry.kind, postedAt, reference });
        }
        for (const line of entry.lines) {
          if (!line.account.startsWith('liability:case:')) continue;
          const caseId = line.account.slice('liability:case:'.length);
          const overdrawn = caseFunds(caseId).find((summary) => summary.heldMinor < 0);
          if (overdrawn) throw new DomainError('INSUFFICIENT_CASE_FUNDS', `case fund ${line.account} would be overdrawn`);
        }
        return id;
      },
      ensureCaseFund: async (caseId, currency) => ensureAccount(`liability:case:${caseId}`, currency).code,
      caseFund: async (caseId) => caseFunds(caseId),
      lines: async ({ limit, kind, accountPrefix }) =>
        cloneAll(
          s()
            .journal.filter((line) => (!kind || line.kind === kind) && (!accountPrefix || line.account.startsWith(accountPrefix)))
            .slice(-limit)
            .reverse(),
        ),
      balance: async (account, currency) => {
        const debitNormal = ['asset', 'expense'].includes(accountType(account));
        let total = 0;
        for (const line of s().journal) {
          if (line.account !== account || line.currency !== currency) continue;
          const signed = line.direction === 'debit' ? line.amountMinor : -line.amountMinor;
          total += debitNormal ? signed : -signed;
        }
        return total;
      },
    };
  }

  // ------------------------------------------------------------------ payouts & refunds (four eyes)
  private payoutsRepo(): PayoutsRepo {
    const s = () => this.state;
    const check = (row: PayoutRow) => {
      if (row.approvedBy && row.approvedBy === row.requestedBy) throw new DomainError('SELF_APPROVAL_FORBIDDEN');
      if (row.paidBy && row.paidBy === row.requestedBy) throw new DomainError('SELF_APPROVAL_FORBIDDEN');
      if ((row.status === 'approved' || row.status === 'paid') && (!row.approvedBy || !row.approvedAt)) {
        throw new DomainError('VALIDATION_FAILED', 'payout needs an approver');
      }
      if (row.status === 'paid' && (!row.paidAt || !row.bankReference)) throw new DomainError('VALIDATION_FAILED', 'paid payouts need a bank reference');
    };
    return {
      byId: async (id) => clone(s().payouts.get(id) ?? null),
      forCase: async (caseId) => cloneAll([...s().payouts.values()].filter((row) => row.caseId === caseId)),
      list: async (filter) => cloneAll([...s().payouts.values()].filter((row) => !filter?.status || row.status === filter.status)),
      insert: async (row) => {
        check(row);
        s().payouts.set(row.id, clone(row));
      },
      update: async (id, patch) => {
        const current = s().payouts.get(id);
        if (!current) throw new DomainError('NOT_FOUND', `payout ${id} not found`);
        const next = { ...current, ...patch };
        check(next);
        s().payouts.set(id, next);
      },
    };
  }

  private refundsRepo(): RefundsRepo {
    const s = () => this.state;
    const check = (row: RefundRow) => {
      if (row.approvedBy && row.approvedBy === row.requestedBy) throw new DomainError('SELF_APPROVAL_FORBIDDEN');
    };
    return {
      byId: async (id) => clone(s().refunds.get(id) ?? null),
      forDonation: async (donationId) => cloneAll([...s().refunds.values()].filter((row) => row.donationId === donationId)),
      list: async (filter) => cloneAll([...s().refunds.values()].filter((row) => !filter?.status || row.status === filter.status)),
      insert: async (row) => {
        check(row);
        s().refunds.set(row.id, clone(row));
      },
      update: async (id, patch) => {
        const current = s().refunds.get(id);
        if (!current) throw new DomainError('NOT_FOUND', `refund ${id} not found`);
        const next = { ...current, ...patch };
        check(next);
        s().refunds.set(id, next);
      },
    };
  }

  // ------------------------------------------------------------------ outbox, audit, notifications
  private outboxRepo(): OutboxRepo {
    const s = () => this.state;
    return {
      enqueue: async (event) => {
        const now = this.clock();
        s().outbox.push({
          id: (s().seq.outbox += 1),
          type: event.type,
          aggregateId: event.aggregateId,
          payload: clone(event.payload),
          availableAt: event.availableAt ?? now,
          status: 'pending',
          attempts: 0,
          lastError: null,
          createdAt: now,
        });
      },
      claim: async (limit, now) => {
        const due = s()
          .outbox.filter((row) => row.status === 'pending' && row.availableAt <= now)
          .slice(0, limit);
        for (const row of due) {
          row.status = 'processing';
          row.attempts += 1;
        }
        return cloneAll(due);
      },
      markSent: async (id) => {
        const row = s().outbox.find((item) => item.id === id);
        if (row) row.status = 'sent';
      },
      markFailed: async (id, error, retryAt) => {
        const row = s().outbox.find((item) => item.id === id);
        if (!row) return;
        row.lastError = error;
        row.status = retryAt ? 'pending' : 'failed';
        if (retryAt) row.availableAt = retryAt;
      },
    };
  }

  private auditRepo(): AuditRepo {
    const s = () => this.state;
    return {
      record: async (entry) => {
        s().audit.push({ ...clone(entry), id: (s().seq.audit += 1), createdAt: entry.createdAt ?? this.clock() });
      },
      list: async ({ limit, entityType, entityId }) =>
        cloneAll(
          s()
            .audit.filter((row) => (!entityType || row.entityType === entityType) && (!entityId || row.entityId === entityId))
            .slice(-limit)
            .reverse(),
        ),
    };
  }

  private notificationsRepo(): NotificationsRepo {
    const s = () => this.state;
    return {
      insert: async (row) => {
        if (!s().notifications.has(row.id)) s().notifications.set(row.id, clone(row));
      },
      forUser: async (userId, limit) =>
        cloneAll(
          [...s().notifications.values()]
            .filter((row) => row.userId === userId)
            .sort((a, b) => +b.createdAt - +a.createdAt)
            .slice(0, limit),
        ),
      markRead: async (userId, ids, at) => {
        for (const id of ids) {
          const row = s().notifications.get(id);
          if (row && row.userId === userId && !row.readAt) row.readAt = at;
        }
      },
    };
  }

  // ------------------------------------------------------------------ reports
  private reportsRepo(): ReportsRepo {
    const s = () => this.state;
    const credited = (since: Date) =>
      [...s().donations.values()].filter(
        (row) => (row.status === 'succeeded' || row.status === 'partially_refunded') && row.succeededAt && row.succeededAt >= since,
      );
    const egp = (minor: number, currency: Currency, rates: RatesToEgp) => Math.round(minor * rates[currency]);
    return {
      donationTotals: async (since, rates) => {
        const rows = credited(since);
        return {
          count: rows.length,
          amountEgpMinor: rows.reduce((sum, row) => sum + egp(row.netToCaseMinor, row.caseCurrency, rates), 0),
          feesEgpMinor: rows.reduce((sum, row) => sum + egp(row.feeMinor ?? 0, row.currency, rates), 0),
        };
      },
      dailySeries: async (since, rates) => {
        const days = new Map<string, { amountMinor: number; count: number }>();
        for (const row of credited(since)) {
          const date = row.succeededAt!.toISOString().slice(0, 10);
          const day = days.get(date) ?? { amountMinor: 0, count: 0 };
          day.amountMinor += egp(row.netToCaseMinor, row.caseCurrency, rates);
          day.count += 1;
          days.set(date, day);
        }
        return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => ({ date, ...day }));
      },
      byMethod: async (since, rates) => {
        const methods = new Map<DonationRow['method'], { amountMinor: number; count: number }>();
        for (const row of credited(since)) {
          const entry = methods.get(row.method) ?? { amountMinor: 0, count: 0 };
          entry.amountMinor += egp(row.netToCaseMinor, row.caseCurrency, rates);
          entry.count += 1;
          methods.set(row.method, entry);
        }
        return [...methods.entries()].map(([method, entry]) => ({ method, ...entry })).sort((a, b) => b.amountMinor - a.amountMinor);
      },
      byCategory: async (since, rates) => {
        const categories = new Map<CaseRow['category'], number>();
        for (const row of credited(since)) {
          const category = s().cases.get(row.caseId)?.category;
          if (category) categories.set(category, (categories.get(category) ?? 0) + egp(row.netToCaseMinor, row.caseCurrency, rates));
        }
        return [...categories.entries()].map(([category, amountMinor]) => ({ category, amountMinor })).sort((a, b) => b.amountMinor - a.amountMinor);
      },
      caseCounts: async () => {
        const counts: Partial<Record<CaseStatus, number>> = {};
        for (const row of s().cases.values()) counts[row.status] = (counts[row.status] ?? 0) + 1;
        return counts;
      },
      donationCounts: async () => {
        const counts: Partial<Record<DonationRow['status'], number>> = {};
        for (const row of s().donations.values()) counts[row.status] = (counts[row.status] ?? 0) + 1;
        return counts;
      },
      medianHoursToFund: async () => {
        const hours = [...s().cases.values()]
          .filter((row) => row.fundedAt && row.publishedAt)
          .map((row) => (row.fundedAt!.getTime() - row.publishedAt!.getTime()) / 3_600_000)
          .sort((a, b) => a - b);
        if (!hours.length) return 0;
        const middle = Math.floor(hours.length / 2);
        return Math.round(hours.length % 2 ? hours[middle]! : (hours[middle - 1]! + hours[middle]!) / 2);
      },
      donors: async (rates) => {
        const donors = new Map<Id, { donorId: Id; donationsCount: number; givenEgpMinor: number; firstAt: Date; lastAt: Date }>();
        for (const row of credited(new Date(0))) {
          if (!row.donorId) continue;
          const entry = donors.get(row.donorId) ?? {
            donorId: row.donorId,
            donationsCount: 0,
            givenEgpMinor: 0,
            firstAt: row.succeededAt!,
            lastAt: row.succeededAt!,
          };
          entry.donationsCount += 1;
          entry.givenEgpMinor += egp(row.netToCaseMinor, row.caseCurrency, rates);
          if (row.succeededAt! < entry.firstAt) entry.firstAt = row.succeededAt!;
          if (row.succeededAt! > entry.lastAt) entry.lastAt = row.succeededAt!;
          donors.set(row.donorId, entry);
        }
        return cloneAll([...donors.values()].sort((a, b) => b.givenEgpMinor - a.givenEgpMinor));
      },
      volunteers: async () =>
        [...s().volunteers.values()].map((profile) => ({
          userId: profile.userId,
          status: profile.status,
          region: profile.region,
          joinedAt: profile.joinedAt,
          casesSubmitted: [...s().cases.values()].filter((row) => row.submittedBy === profile.userId).length,
          visitsDone: [...s().tasks.values()].filter((row) => row.auditorId === profile.userId && row.status === 'completed').length,
        })),
    };
  }
}

/** Case statuses shown on the public catalog. */
export const PUBLIC_STATUSES: readonly CaseStatus[] = ['published', 'funded', 'closed'];
