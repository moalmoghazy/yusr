/**
 * Read models for the control hub, in the exact shapes of @yusr/core's admin types, so
 * the admin app talks to this API and to the in-memory demo backend (@yusr/sdk/mock)
 * through the same client. Each view checks its own permission.
 */
import {
  CASE_STATUSES,
  DomainError,
  hasPermission,
  isStaff,
  type ActivityItem,
  type AdminCase,
  type AdminDonation,
  type AdminOverview,
  type AuditEntity,
  type AuditEntry,
  type CaseStatus,
  type Currency,
  type DonorRow,
  type DonorSegment,
  type LedgerLine,
  type Localized,
  type Payout,
  type PlatformStats,
  type Refund,
  type Role,
  type TeamMember,
  type VerificationTask,
  type VolunteerRow,
} from '@yusr/core';
import { primaryRole, requirePermission, type CallContext, type RequestActor } from '../common/actor';
import { systemClock, type Clock } from '../common/clock';
import { mask } from '../common/crypto';
import type { Database, RatesToEgp } from '../db/ports';
import type { AuditRow, DonationRow, PayoutRow, RefundRow, UserRow, VerificationTaskRow } from '../db/rows';
import { MFA_ENROLLMENT_WINDOW_MS } from '../auth/auth.service';
import type { CasesService } from '../cases/cases.service';
import type { DonationsService } from '../donations/donations.service';
import type { FxProvider } from '../payments/fx';

export interface AdminQueriesDeps {
  db: Database;
  cases: CasesService;
  donations: DonationsService;
  fx: FxProvider;
  clock: Clock;
}

const same = (text: string): Localized => ({ ar: text, en: text });
const SYSTEM_NAME: Localized = { ar: 'منصة يُسر', en: 'Yusr' };
const DAY = 86_400_000;

export class AdminQueries {
  private readonly names = new Map<string, string>();

  constructor(private readonly deps: AdminQueriesDeps) {}

  private rates(): RatesToEgp {
    const table = this.deps.fx.current();
    // FxTable rates are "units of the reference currency per 1 unit of X"; the reference is EGP.
    const toEgp = (currency: Currency) => table.rates[currency] / table.rates.EGP;
    return { EGP: 1, SAR: toEgp('SAR'), USD: toEgp('USD') };
  }

  private async name(userId: string | null): Promise<string> {
    if (!userId) return 'system';
    const cached = this.names.get(userId);
    if (cached) return cached;
    const user = await this.deps.db.read.users.byId(userId);
    const name = user?.displayName ?? '—';
    this.names.set(userId, name);
    return name;
  }

  /** Headline numbers on the landing page (public). */
  async publicStats(): Promise<PlatformStats> {
    const { db } = this.deps;
    const rates = this.rates();
    const [totals, counts, median, donors] = await Promise.all([
      db.read.reports.donationTotals(new Date(0), rates),
      db.read.reports.caseCounts(),
      db.read.reports.medianHoursToFund(),
      db.read.reports.donors(rates),
    ]);
    const regions = await db.read.cases.search({ statuses: ['published', 'funded', 'closed'], limit: 50 });
    return {
      raisedMinor: totals.amountEgpMinor,
      casesFunded: (counts.funded ?? 0) + (counts.closed ?? 0),
      donors: Math.max(donors.length, totals.count),
      regionsCovered: new Set(regions.items.map((item) => item.region)).size,
      medianHoursToFund: median,
    };
  }

  // ------------------------------------------------------------------ overview
  async overview(context: CallContext): Promise<AdminOverview> {
    requirePermission(context.actor, 'cases:read');
    const { db, clock } = this.deps;
    const now = clock.now();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rates = this.rates();
    const [todayTotals, monthTotals, caseCounts, donationCounts, median, series, byMethod, byCategory, refunds, audit] = await Promise.all([
      db.read.reports.donationTotals(today, rates),
      db.read.reports.donationTotals(month, rates),
      db.read.reports.caseCounts(),
      db.read.reports.donationCounts(),
      db.read.reports.medianHoursToFund(),
      db.read.reports.dailySeries(new Date(now.getTime() - 29 * DAY), rates),
      db.read.reports.byMethod(new Date(now.getTime() - 30 * DAY), rates),
      db.read.reports.byCategory(new Date(now.getTime() - 30 * DAY), rates),
      db.read.refunds.list({ status: 'requested' }),
      db.read.audit.list({ limit: 40 }),
    ]);
    const days = new Map(series.map((point) => [point.date, point]));
    const filled = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(now.getTime() - (29 - index) * DAY).toISOString().slice(0, 10);
      return days.get(date) ?? { date, amountMinor: 0, count: 0 };
    });
    const activity: ActivityItem[] = [];
    for (const row of await db.read.donations.list({ status: 'succeeded', limit: 10 })) {
      const item = await db.read.cases.byId(row.caseId);
      const donor = row.anonymous ? null : row.donorId ? await this.name(row.donorId) : (row.guestContact?.name ?? null);
      activity.push({
        id: row.id,
        at: (row.succeededAt ?? row.createdAt).toISOString(),
        kind: 'donation',
        actorName: donor ? same(donor) : null,
        caseTitle: item?.title ?? null,
        amountMinor: row.amountMinor,
        currency: row.currency,
        status: null,
      });
    }
    for (const row of audit.filter((entry) => entry.entityType === 'case' || entry.entityType === 'payout')) {
      const payout = row.entityType === 'payout' ? await db.read.payouts.byId(row.entityId) : null;
      const item = await db.read.cases.byId(payout?.caseId ?? row.entityId);
      activity.push({
        id: `audit-${row.id}`,
        at: row.createdAt.toISOString(),
        kind: row.entityType === 'payout' ? 'payout' : 'case',
        actorName: row.actorId ? same(await this.name(row.actorId)) : SYSTEM_NAME,
        caseTitle: item?.title ?? null,
        amountMinor: payout?.amountMinor ?? null,
        currency: payout?.currency ?? null,
        status: (row.after?.['status'] as CaseStatus | undefined) ?? null,
      });
    }
    activity.sort((a, b) => b.at.localeCompare(a.at)).splice(12);

    return {
      kpis: {
        donationsTodayMinor: todayTotals.amountEgpMinor,
        donationsTodayCount: todayTotals.count,
        donationsMonthMinor: monthTotals.amountEgpMinor,
        activeCases: caseCounts.published ?? 0,
        pendingReview: (caseCounts.under_review ?? 0) + (caseCounts.field_verified ?? 0),
        awaitingTransfers: donationCounts.awaiting_transfer ?? 0,
        medianHoursToFund: median,
        feesMonthMinor: monthTotals.feesEgpMinor,
        refundsOpen: refunds.length,
      },
      series: filled,
      byMethod,
      byCategory,
      activity,
    };
  }

  // ------------------------------------------------------------------ cases & verification
  async cases(filter: { status?: CaseStatus; q?: string }, context: CallContext): Promise<AdminCase[]> {
    requirePermission(context.actor, 'cases:read');
    const page = await this.deps.db.read.cases.search({
      statuses: filter.status ? [filter.status] : CASE_STATUSES,
      q: filter.q,
      sort: 'newest',
      limit: 50,
    });
    const result: AdminCase[] = [];
    for (const row of page.items) result.push(await this.deps.cases.adminCase(row.id, context));
    return result;
  }

  async verificationTasks(context: CallContext): Promise<VerificationTask[]> {
    const actor = requirePermission(context.actor, 'cases:read');
    const own = !hasPermission(actor.roles, 'verifications:assign');
    const rows = await this.deps.db.read.verification.list(own ? { auditorId: actor.id } : undefined);
    const tasks: VerificationTask[] = [];
    for (const row of rows) if (row.status !== 'cancelled') tasks.push(await this.toVerificationTask(row));
    return tasks;
  }

  async toVerificationTask(row: VerificationTaskRow): Promise<VerificationTask> {
    return {
      id: row.id,
      caseId: row.caseId,
      auditorId: row.auditorId,
      auditorName: await this.name(row.auditorId),
      status: row.status,
      visitAt: row.visitAt?.toISOString() ?? null,
      checklist: row.checklist,
      recommendedMinor: row.recommendedMinor,
      notes: row.notes,
    };
  }

  // ------------------------------------------------------------------ finance
  async ledger(query: { limit?: number; kind?: LedgerLine['kind']; account?: string }, context: CallContext): Promise<LedgerLine[]> {
    requirePermission(context.actor, 'finance:read');
    const lines = await this.deps.db.read.ledger.lines({
      limit: Math.min(query.limit ?? 200, 1_000),
      kind: query.kind,
      accountPrefix: query.account,
    });
    return lines
      .filter((line) => line.kind !== 'adjustment')
      .map((line) => ({
        id: String(line.id),
        transactionId: line.entryId,
        kind: line.kind as LedgerLine['kind'],
        at: line.postedAt.toISOString(),
        account: line.account,
        direction: line.direction,
        amountMinor: line.amountMinor,
        currency: line.currency,
        memo: line.memo ?? '',
        reference: line.reference ?? '',
      }));
  }

  async donations(filter: { status?: DonationRow['status'] }, context: CallContext): Promise<AdminDonation[]> {
    requirePermission(context.actor, 'finance:read');
    const rows = await this.deps.db.read.donations.list({ status: filter.status, limit: 200 });
    const result: AdminDonation[] = [];
    for (const row of rows) {
      const donation = await this.toAdminDonation(row);
      if (donation) result.push(donation);
    }
    return result;
  }

  async donation(donationId: string, context: CallContext): Promise<AdminDonation> {
    requirePermission(context.actor, 'finance:read');
    const row = await this.deps.db.read.donations.byId(donationId);
    const donation = row ? await this.toAdminDonation(row) : null;
    if (!donation) throw new DomainError('NOT_FOUND', 'Donation not found');
    return donation;
  }

  private async toAdminDonation(row: DonationRow): Promise<AdminDonation | null> {
    const { db, donations } = this.deps;
    const item = await db.read.cases.byId(row.caseId);
    if (!item) return null;
    const donor: UserRow | null = row.donorId ? await db.read.users.byId(row.donorId) : null;
    const contact = donor?.email ?? donor?.phone ?? row.guestContact?.email ?? row.guestContact?.phone ?? null;
    return {
      ...donations.toReceipt(row, item),
      donorName: donor?.displayName ?? row.guestContact?.name ?? null,
      donorContact: contact ? mask(contact, 4) : null,
      caseReference: item.reference,
      channel: row.channel === 'mobile' ? 'mobile' : 'web',
    };
  }

  async refunds(context: CallContext): Promise<Refund[]> {
    requirePermission(context.actor, 'finance:read');
    const result: Refund[] = [];
    for (const row of await this.deps.db.read.refunds.list()) result.push(await this.toRefund(row));
    return result;
  }

  async refund(refundId: string, context: CallContext): Promise<Refund> {
    requirePermission(context.actor, 'finance:read');
    const row = await this.deps.db.read.refunds.byId(refundId);
    if (!row) throw new DomainError('NOT_FOUND', 'Refund not found');
    return this.toRefund(row);
  }

  private async toRefund(row: RefundRow): Promise<Refund> {
    const donation = await this.deps.db.read.donations.byId(row.donationId);
    return {
      id: row.id,
      donationId: row.donationId,
      receiptNumber: donation?.receiptNo ?? '—',
      amountMinor: row.amountMinor,
      currency: donation?.currency ?? 'EGP',
      reason: row.reason,
      status: row.status,
      requestedBy: { id: row.requestedBy, name: await this.name(row.requestedBy) },
      approvedBy: row.approvedBy ? { id: row.approvedBy, name: await this.name(row.approvedBy) } : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async payouts(context: CallContext): Promise<Payout[]> {
    requirePermission(context.actor, 'finance:read');
    const result: Payout[] = [];
    for (const row of await this.deps.db.read.payouts.list()) {
      const payout = await this.toPayout(row);
      if (payout) result.push(payout);
    }
    return result;
  }

  async payout(payoutId: string, context: CallContext): Promise<Payout> {
    requirePermission(context.actor, 'finance:read');
    const row = await this.deps.db.read.payouts.byId(payoutId);
    const payout = row ? await this.toPayout(row) : null;
    if (!payout) throw new DomainError('NOT_FOUND', 'Payout not found');
    return payout;
  }

  private async toPayout(row: PayoutRow): Promise<Payout | null> {
    const { db } = this.deps;
    const [item, line] = await Promise.all([db.read.cases.byId(row.caseId), db.read.cases.line(row.lineId)]);
    if (!item || !line) return null;
    return {
      id: row.id,
      reference: row.reference,
      lineId: row.lineId,
      caseId: row.caseId,
      caseReference: item.reference,
      caseTitle: item.title,
      payeeType: line.payeeType,
      payee: line.payee,
      purpose: line.purpose,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status,
      requestedBy: { id: row.requestedBy, name: await this.name(row.requestedBy) },
      approvedBy: row.approvedBy ? { id: row.approvedBy, name: await this.name(row.approvedBy) } : null,
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
    };
  }

  // ------------------------------------------------------------------ people
  async donors(context: CallContext): Promise<DonorRow[]> {
    requirePermission(context.actor, 'crm:read');
    const { db, clock } = this.deps;
    const now = clock.now().getTime();
    const result: DonorRow[] = [];
    for (const stats of await db.read.reports.donors(this.rates())) {
      const user = await db.read.users.byId(stats.donorId);
      if (!user) continue;
      const daysSinceLast = (now - stats.lastAt.getTime()) / DAY;
      const daysSinceFirst = (now - stats.firstAt.getTime()) / DAY;
      const segment: DonorSegment =
        stats.givenEgpMinor >= 50_000_00
          ? 'major'
          : daysSinceLast > 180
            ? 'lapsed'
            : stats.donationsCount >= 3
              ? 'recurring'
              : daysSinceFirst <= 30
                ? 'new'
                : 'recurring';
      const contact = user.email ?? user.phone ?? '';
      result.push({
        id: user.id,
        name: same(user.displayName),
        region: user.region ?? 'EG-C',
        totalMinor: stats.givenEgpMinor,
        donationsCount: stats.donationsCount,
        lastDonationAt: stats.lastAt.toISOString(),
        segment,
        contactMasked: contact ? mask(contact, 4) : '—',
      });
    }
    return result;
  }

  async volunteers(context: CallContext): Promise<VolunteerRow[]> {
    const actor = requirePermission(context.actor, 'cases:read');
    if (!hasPermission(actor.roles, 'crm:read') && !hasPermission(actor.roles, 'volunteers:manage'))
      throw new DomainError('FORBIDDEN', 'Missing permission crm:read');
    const result: VolunteerRow[] = [];
    for (const stats of await this.deps.db.read.reports.volunteers()) {
      const user = await this.deps.db.read.users.byId(stats.userId);
      if (!user) continue;
      result.push({
        id: user.id,
        name: same(user.displayName),
        region: stats.region,
        casesSubmitted: stats.casesSubmitted,
        visitsDone: stats.visitsDone,
        status: stats.status,
        contactMasked: user.phone ? mask(user.phone, 4) : '—',
        joinedAt: stats.joinedAt.toISOString(),
      });
    }
    return result;
  }

  async team(context: CallContext): Promise<TeamMember[]> {
    requirePermission(context.actor, 'cases:read');
    const staff = await this.deps.db.read.users.staff();
    return staff.map((user) => ({
      id: user.id,
      name: same(user.displayName),
      email: user.email ?? '',
      roles: user.roles,
      mfa: user.mfaEnabled,
      lastActiveAt: user.updatedAt.toISOString(),
    }));
  }

  // ------------------------------------------------------------------ audit
  async audit(limit: number, context: CallContext): Promise<AuditEntry[]> {
    requirePermission(context.actor, 'audit:read');
    const rows = await this.deps.db.read.audit.list({ limit: Math.min(Math.max(limit, 1), 500) });
    const result: AuditEntry[] = [];
    for (const row of rows) result.push(await this.auditEntry(row));
    return result;
  }

  private async auditEntry(row: AuditRow): Promise<AuditEntry> {
    const { db } = this.deps;
    let label = row.entityId;
    if (row.entityType === 'case') label = (await db.read.cases.byId(row.entityId))?.reference ?? label;
    if (row.entityType === 'donation') label = (await db.read.donations.byId(row.entityId))?.receiptNo ?? label;
    if (row.entityType === 'payout') label = (await db.read.payouts.byId(row.entityId))?.reference ?? label;
    if (row.entityType === 'user') label = await this.name(row.entityId);
    if (row.entityType === 'refund') {
      const refund = await db.read.refunds.byId(row.entityId);
      label = refund ? ((await db.read.donations.byId(refund.donationId))?.receiptNo ?? label) : label;
    }
    if (row.entityType === 'verification') {
      const task = await db.read.verification.byId(row.entityId);
      label = task ? ((await db.read.cases.byId(task.caseId))?.reference ?? label) : label;
    }
    const role: Role | 'system' = row.actorRole ?? (row.actorId ? 'donor' : 'system');
    return {
      id: String(row.id),
      at: row.createdAt.toISOString(),
      actor: { id: row.actorId ?? 'system', name: row.actorId ? await this.name(row.actorId) : 'system', role },
      action: row.action,
      entityType: row.entityType as AuditEntity,
      entityId: row.entityId,
      entityLabel: label,
      before: row.before ?? null,
      after: row.after ?? null,
    };
  }
}

/** Role management for super admins, with guard rails. */
export class TeamService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async updateRoles(userId: string, roles: Role[], context: CallContext): Promise<TeamMember> {
    const actor: RequestActor = requirePermission(context.actor, 'team:manage');
    if (!roles.length) throw new DomainError('VALIDATION_FAILED', 'Keep at least one role', { field: 'roles' });
    return this.db.transaction(async (tx) => {
      const user = await tx.users.byId(userId);
      if (!user) throw new DomainError('NOT_FOUND', 'User not found');
      if (user.id === actor.id && user.roles.includes('super_admin') && !roles.includes('super_admin')) {
        throw new DomainError('FORBIDDEN', 'You cannot remove your own super admin role');
      }
      if (user.roles.includes('super_admin') && !roles.includes('super_admin')) {
        const admins = (await tx.users.staff()).filter((member) => member.roles.includes('super_admin'));
        if (admins.length <= 1) throw new DomainError('FORBIDDEN', 'The platform needs at least one super admin');
      }
      const now = this.clock.now();
      const promoted = isStaff(roles) && !isStaff(user.roles);
      // A new staff member gets a fresh authenticator through a one-day enrollment opened by this
      // super admin; anything enrolled before the promotion is discarded.
      const mfaPatch: Partial<UserRow> = promoted
        ? { mfaEnabled: false, totpSecretCipher: null, totpLastStep: null, mfaEnrollmentExpiresAt: new Date(now.getTime() + MFA_ENROLLMENT_WINDOW_MS) }
        : !isStaff(roles)
          ? { mfaEnrollmentExpiresAt: null }
          : {};
      await tx.users.update(user.id, { roles, ...mfaPatch });
      // Live sessions carry the old roles: sign the person out everywhere so the change applies now.
      const revoked = await tx.refreshTokens.revokeAllForUser(user.id, now);
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'user.roles_updated',
        entityType: 'user',
        entityId: user.id,
        before: { roles: user.roles },
        after: { roles, sessionsRevoked: revoked, ...(promoted ? { mfaEnrollmentOpened: true } : {}) },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      return {
        id: user.id,
        name: same(user.displayName),
        email: user.email ?? '',
        roles,
        mfa: promoted ? false : user.mfaEnabled,
        lastActiveAt: now.toISOString(),
      };
    });
  }
}
