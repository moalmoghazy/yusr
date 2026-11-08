/**
 * The approved-partner registry and «كود يُسر».
 *
 * Yusr lists cases only from جمعيات أهلية it has approved, coordinated with and signed a contract with.
 * A content moderator (or super admin) adds each one after signature; the platform then issues its
 * «كود يُسر». With its رقم الإشهار the code lets anyone from the association submit a case and upload its
 * documents, without a donor account. Staff with `partners:manage` can read the code again to hand it
 * over; it never leaves the API anywhere else, is never logged, and is checked by comparing keyed
 * hashes in constant time. Every change is audited (without the code or the contact's phone).
 */
import { randomBytes } from 'node:crypto';
import {
  DomainError,
  PUBLIC_CASE_STATUSES,
  generateYusrCode,
  partnerLogoProblem,
  type Partner,
  type PartnerApplication,
  type PartnerApplicationStatus,
  type PartnerCredentials,
  type PartnerLogoType,
  type PartnerStatus,
  type PublicPartner,
} from '@yusr/core';
import type { CreatePartnerInput, PartnerApplicationInput, PartnerLogoInput, PartnerShowcaseInput, UpdatePartnerInput } from '@yusr/core/schemas';
import { primaryRole, requirePermission, type CallContext } from '../common/actor';
import type { FieldCipher } from '../common/cipher';
import type { Clock } from '../common/clock';
import { hmacHex, safeEqual } from '../common/crypto';
import type { IdGenerator } from '../common/ids';
import type { RateLimiter } from '../common/rate-limit';
import type { Database, Tx } from '../db/ports';
import type { PartnerApplicationRow, PartnerRow } from '../db/rows';

export interface PartnersConfig {
  /** Server secret for the codes' keyed hash (domain-separated from its other uses). */
  codePepper: string;
}

export interface PartnersDeps {
  db: Database;
  cipher: FieldCipher;
  clock: Clock;
  ids: IdGenerator;
  limiter: RateLimiter;
  config: PartnersConfig;
  /** Source of randomness for new codes (crypto-strong; tests may pass their own). */
  randomBytes?: (count: number) => Uint8Array;
}

/** What a verified partner is allowed to act as: its id (upload prefix) and its registry identity. */
export type VerifiedPartner = Pick<PartnerRow, 'id' | 'name' | 'registrationNumber'>;

/** Wrong pairs per client IP before the check answers RATE_LIMITED (on top of the endpoints' own limits). */
const FAILED_CHECKS = { limit: 20, windowSeconds: 3_600 } as const;

/** Raised for an unknown number, a wrong code and a suspended partner alike, so none can be told apart. */
function notVerified(): DomainError {
  return new DomainError('VALIDATION_FAILED', 'The registration number and Yusr code do not match an active partner', {
    field: 'association.yusrCode',
    reason: 'partner_not_verified',
  });
}

const today = (now: Date) => now.toISOString().slice(0, 10);

/** Changes with every upload, so the website can cache a logo for as long as it likes. */
const logoVersion = (row: PartnerRow): string | null => (row.logoUpdatedAt ? row.logoUpdatedAt.getTime().toString(36) : null);

/** HMAC-SHA256 of a canonical «كود يُسر» under the server pepper (also used by the demo seed). */
export function yusrCodeHash(pepper: string, code: string): string {
  return hmacHex('sha256', pepper, `yusr-code:${code}`);
}

export class PartnersService {
  private readonly random: (count: number) => Uint8Array;

  constructor(private readonly deps: PartnersDeps) {
    this.random = deps.randomBytes ?? ((count) => randomBytes(count));
  }

  /** HMAC-SHA256 of a canonical code: unique in the registry, and what submissions are compared with. */
  codeHash(code: string): string {
    return yusrCodeHash(this.deps.config.codePepper, code);
  }

  // ------------------------------------------------------------------ public
  /** «شركاء يُسر» on the home page: active partners, the most recently joined first. Public facts only. */
  async showcase(limit: number): Promise<PublicPartner[]> {
    const { db } = this.deps;
    const [rows, counts] = await Promise.all([db.read.partners.list(), db.read.partners.caseCounts(PUBLIC_CASE_STATUSES)]);
    return rows
      .filter((row) => row.status === 'active' && row.showcased)
      .sort((a, b) => b.contractSignedOn.localeCompare(a.contractSignedOn) || b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        name: row.name,
        registrationNumber: row.registrationNumber,
        region: row.region,
        joinedOn: row.contractSignedOn,
        casesCount: counts.get(row.id) ?? 0,
        logoVersion: logoVersion(row),
        isNew: row.newBadge,
      }));
  }

  /** A showcased partner's logo, for the website (404 when it has none or is not shown). */
  async publicLogo(id: string): Promise<{ type: PartnerLogoType; bytes: Uint8Array; version: string }> {
    const row = await this.deps.db.read.partners.byId(id).catch(() => null);
    if (!row || row.status !== 'active' || !row.showcased || !row.logo || !row.logoType || !row.logoUpdatedAt) {
      throw new DomainError('NOT_FOUND', 'Logo not found');
    }
    return { type: row.logoType, bytes: row.logo, version: logoVersion(row)! };
  }

  // ------------------------------------------------------------------ staff (partners:manage)
  /** Its logo for the hub's preview, shown or not. */
  async staffLogo(id: string, context: CallContext): Promise<{ type: PartnerLogoType; bytes: Uint8Array; version: string }> {
    requirePermission(context.actor, 'partners:manage');
    const row = await this.deps.db.read.partners.byId(id).catch(() => null);
    if (!row?.logo || !row.logoType || !row.logoUpdatedAt) throw new DomainError('NOT_FOUND', 'Logo not found');
    return { type: row.logoType, bytes: row.logo, version: logoVersion(row)! };
  }

  async list(context: CallContext): Promise<Partner[]> {
    requirePermission(context.actor, 'partners:manage');
    const { db } = this.deps;
    const [rows, counts] = await Promise.all([db.read.partners.list(), db.read.partners.caseCounts()]);
    return Promise.all(rows.map((row) => this.toPartner(db.read, row, counts.get(row.id) ?? 0)));
  }

  async get(id: string, context: CallContext): Promise<Partner> {
    requirePermission(context.actor, 'partners:manage');
    const { db } = this.deps;
    const row = await db.read.partners.byId(id);
    if (!row) throw new DomainError('NOT_FOUND', 'Partner not found');
    return this.toPartner(db.read, row, (await db.read.partners.caseCounts()).get(id) ?? 0);
  }

  /** Adds an association to the approved list (after approval and contract signature) and issues its code. */
  async create(input: CreatePartnerInput, context: CallContext): Promise<Partner> {
    const actor = requirePermission(context.actor, 'partners:manage');
    const { db, cipher, clock, ids } = this.deps;
    const now = clock.now();
    if (input.contractSignedOn > today(now))
      throw new DomainError('VALIDATION_FAILED', 'The contract date cannot be in the future', { field: 'contractSignedOn' });
    const id = ids();
    return db.transaction(async (tx) => {
      if (await tx.partners.byRegistrationNumber(input.registrationNumber)) {
        throw new DomainError('VALIDATION_FAILED', 'A partner with this registration number already exists', { field: 'registrationNumber' });
      }
      const code = await this.newCode(tx);
      const row: PartnerRow = {
        id,
        name: input.name.trim(),
        registrationNumber: input.registrationNumber,
        region: input.region,
        contractSignedOn: input.contractSignedOn,
        contactName: input.contactName.trim(),
        contactPhone: input.contactPhone,
        status: 'active',
        suspendedAt: null,
        codeHash: this.codeHash(code),
        codeCipher: cipher.encrypt(code, `partner-code:${id}`),
        codeIssuedAt: now,
        logo: null,
        logoType: null,
        logoUpdatedAt: null,
        // A new partner shows on the home page at once, with the «جديد» badge until staff take it off.
        showcased: true,
        newBadge: true,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      };
      await tx.partners.insert(row);
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'partner.created',
        entityType: 'partner',
        entityId: id,
        after: { name: row.name, registrationNumber: row.registrationNumber, region: row.region, contractSignedOn: row.contractSignedOn, codeIssued: true },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      return this.toPartner(tx, row, 0);
    });
  }

  async update(id: string, patch: UpdatePartnerInput, context: CallContext): Promise<Partner> {
    const actor = requirePermission(context.actor, 'partners:manage');
    const { db, clock } = this.deps;
    if (patch.contractSignedOn && patch.contractSignedOn > today(clock.now())) {
      throw new DomainError('VALIDATION_FAILED', 'The contract date cannot be in the future', { field: 'contractSignedOn' });
    }
    return db.transaction(async (tx) => {
      const current = await tx.partners.byId(id, 'update');
      if (!current) throw new DomainError('NOT_FOUND', 'Partner not found');
      if (patch.registrationNumber && patch.registrationNumber !== current.registrationNumber) {
        const other = await tx.partners.byRegistrationNumber(patch.registrationNumber);
        if (other && other.id !== id)
          throw new DomainError('VALIDATION_FAILED', 'A partner with this registration number already exists', { field: 'registrationNumber' });
      }
      const next = {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.registrationNumber !== undefined ? { registrationNumber: patch.registrationNumber } : {}),
        ...(patch.region !== undefined ? { region: patch.region } : {}),
        ...(patch.contractSignedOn !== undefined ? { contractSignedOn: patch.contractSignedOn } : {}),
        ...(patch.contactName !== undefined ? { contactName: patch.contactName.trim() } : {}),
        ...(patch.contactPhone !== undefined ? { contactPhone: patch.contactPhone } : {}),
      };
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter((key) => next[key] !== current[key]);
      if (changed.length === 0) return this.toPartner(tx, current, (await tx.partners.caseCounts()).get(id) ?? 0);
      await tx.partners.update(id, next);
      // The contact's phone is personal data: the log says it changed, not what it is.
      const shown = (row: Partial<PartnerRow>) =>
        Object.fromEntries(changed.map((key) => [key, key === 'contactPhone' ? 'changed' : row[key]])) as Record<string, unknown>;
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'partner.updated',
        entityType: 'partner',
        entityId: id,
        before: shown(current),
        after: shown(next),
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      const updated = (await tx.partners.byId(id))!;
      return this.toPartner(tx, updated, (await tx.partners.caseCounts()).get(id) ?? 0);
    });
  }

  /** Suspending stops new submissions with the partner's code at once; published cases stay as they are. */
  async setStatus(id: string, status: PartnerStatus, reason: string | null | undefined, context: CallContext): Promise<Partner> {
    const actor = requirePermission(context.actor, 'partners:manage');
    const { db, clock } = this.deps;
    return db.transaction(async (tx) => {
      const current = await tx.partners.byId(id, 'update');
      if (!current) throw new DomainError('NOT_FOUND', 'Partner not found');
      if (current.status !== status) {
        await tx.partners.update(id, { status, suspendedAt: status === 'suspended' ? clock.now() : null });
        await tx.audit.record({
          actorId: actor.id,
          actorRole: primaryRole(actor),
          action: status === 'suspended' ? 'partner.suspended' : 'partner.reactivated',
          entityType: 'partner',
          entityId: id,
          before: { status: current.status },
          after: { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
          ip: context.ip ?? null,
          requestId: context.requestId ?? null,
        });
      }
      const updated = (await tx.partners.byId(id))!;
      return this.toPartner(tx, updated, (await tx.partners.caseCounts()).get(id) ?? 0);
    });
  }

  // ------------------------------------------------------------------ «شركاء يُسر» on the website
  /** Uploads (or replaces) the logo shown in «شركاء يُسر». */
  async setLogo(id: string, input: PartnerLogoInput, context: CallContext): Promise<Partner> {
    const bytes = Uint8Array.from(Buffer.from(input.dataBase64, 'base64'));
    const problem = partnerLogoProblem(input.contentType, bytes);
    if (problem) throw new DomainError('VALIDATION_FAILED', problem, { field: 'logo' });
    return this.changeShowcase(id, context, 'partner.logo_set', () => ({ logo: bytes, logoType: input.contentType, logoUpdatedAt: this.deps.clock.now() }), {
      logoType: input.contentType,
      bytes: bytes.length,
    });
  }

  async removeLogo(id: string, context: CallContext): Promise<Partner> {
    return this.changeShowcase(id, context, 'partner.logo_removed', () => ({ logo: null, logoType: null, logoUpdatedAt: null }), { logo: null });
  }

  /** Shows or hides the partner in «شركاء يُسر», and puts the «جديد» badge on or off. */
  async setShowcase(id: string, patch: PartnerShowcaseInput, context: CallContext): Promise<Partner> {
    const next = {
      ...(patch.showcased !== undefined ? { showcased: patch.showcased } : {}),
      ...(patch.newBadge !== undefined ? { newBadge: patch.newBadge } : {}),
    };
    return this.changeShowcase(id, context, 'partner.showcase_updated', () => next, next);
  }

  private async changeShowcase(
    id: string,
    context: CallContext,
    action: string,
    patch: () => Partial<Pick<PartnerRow, 'logo' | 'logoType' | 'logoUpdatedAt' | 'showcased' | 'newBadge'>>,
    after: Record<string, unknown>,
  ): Promise<Partner> {
    const actor = requirePermission(context.actor, 'partners:manage');
    const { db } = this.deps;
    return db.transaction(async (tx) => {
      const current = await tx.partners.byId(id, 'update');
      if (!current) throw new DomainError('NOT_FOUND', 'Partner not found');
      await tx.partners.update(id, patch());
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action,
        entityType: 'partner',
        entityId: id,
        before: { showcased: current.showcased, newBadge: current.newBadge, logoType: current.logoType },
        after,
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      const updated = (await tx.partners.byId(id))!;
      return this.toPartner(tx, updated, (await tx.partners.caseCounts()).get(id) ?? 0);
    });
  }

  /** A new code (the old one stops working at once), e.g. when it was shared beyond the association. */
  async regenerateCode(id: string, context: CallContext): Promise<Partner> {
    const actor = requirePermission(context.actor, 'partners:manage');
    const { db, cipher, clock } = this.deps;
    return db.transaction(async (tx) => {
      const current = await tx.partners.byId(id, 'update');
      if (!current) throw new DomainError('NOT_FOUND', 'Partner not found');
      const code = await this.newCode(tx);
      const now = clock.now();
      await tx.partners.update(id, { codeHash: this.codeHash(code), codeCipher: cipher.encrypt(code, `partner-code:${id}`), codeIssuedAt: now });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'partner.code_regenerated',
        entityType: 'partner',
        entityId: id,
        before: { codeIssuedAt: current.codeIssuedAt.toISOString() },
        after: { codeIssuedAt: now.toISOString() },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      const updated = (await tx.partners.byId(id))!;
      return this.toPartner(tx, updated, (await tx.partners.caseCounts()).get(id) ?? 0);
    });
  }

  // ------------------------------------------------------------------ join requests («انضم كجمعية شريكة»)
  /**
   * An association asks to join, from the website and without an account. Staff are told (Slack), then
   * contact it; an approved one is added to the registry after the contract is signed. The contact's
   * details are kept out of the audit log and the notice.
   */
  async apply(input: PartnerApplicationInput, context: CallContext): Promise<{ received: true }> {
    const { db, clock, ids } = this.deps;
    const now = clock.now();
    const row: PartnerApplicationRow = {
      id: ids(),
      name: input.name.trim(),
      registrationNumber: input.registrationNumber,
      region: input.region,
      contactName: input.contactName.trim(),
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail?.trim() || null,
      message: input.message?.trim() || null,
      status: 'new',
      handledBy: null,
      handledAt: null,
      createdAt: now,
    };
    await db.transaction(async (tx) => {
      await tx.partners.insertApplication(row);
      await tx.audit.record({
        actorId: context.actor?.id ?? null,
        actorRole: context.actor ? primaryRole(context.actor) : null,
        action: 'partner.applied',
        entityType: 'partner_application',
        entityId: row.id,
        after: { name: row.name, registrationNumber: row.registrationNumber, region: row.region },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      await tx.outbox.enqueue({
        type: 'partner.applied',
        aggregateId: row.id,
        payload: { applicationId: row.id, name: row.name, registrationNumber: row.registrationNumber, region: row.region },
      });
    });
    return { received: true };
  }

  async applications(context: CallContext, limit = 100): Promise<PartnerApplication[]> {
    requirePermission(context.actor, 'partners:manage');
    const { db } = this.deps;
    const rows = await db.read.partners.applications(Math.min(Math.max(limit, 1), 200));
    return Promise.all(rows.map((row) => this.toApplication(db.read, row)));
  }

  /** Marks a request as contacted, approved or rejected (adding the partner itself is a separate step). */
  async setApplicationStatus(id: string, status: Exclude<PartnerApplicationStatus, 'new'>, context: CallContext): Promise<PartnerApplication> {
    const actor = requirePermission(context.actor, 'partners:manage');
    const { db, clock } = this.deps;
    return db.transaction(async (tx) => {
      const current = await tx.partners.applicationById(id, 'update');
      if (!current) throw new DomainError('NOT_FOUND', 'Application not found');
      if (current.status !== status) {
        await tx.partners.updateApplication(id, { status, handledBy: actor.id, handledAt: clock.now() });
        await tx.audit.record({
          actorId: actor.id,
          actorRole: primaryRole(actor),
          action: 'partner.application_' + status,
          entityType: 'partner_application',
          entityId: id,
          before: { status: current.status },
          after: { status },
          ip: context.ip ?? null,
          requestId: context.requestId ?? null,
        });
      }
      return this.toApplication(tx, (await tx.partners.applicationById(id))!);
    });
  }

  // ------------------------------------------------------------------ submissions
  /**
   * Checks رقم الإشهار + «كود يُسر» (both already normalized by the shared schema) against the registry.
   * The presented code's keyed hash is compared with the stored one in constant time; an unknown number
   * is compared against a dummy so it takes as long. Unknown, wrong and suspended all fail the same way.
   */
  async verify(credentials: PartnerCredentials, context: Pick<CallContext, 'ip'>): Promise<VerifiedPartner> {
    const presented = this.codeHash(credentials.yusrCode);
    const partner = await this.deps.db.read.partners.byRegistrationNumber(credentials.registrationNumber);
    const matches = safeEqual(presented, partner?.codeHash ?? '0'.repeat(64));
    if (!partner || !matches || partner.status !== 'active') {
      await this.deps.limiter.consume(`partners:failed:ip:${context.ip ?? 'unknown'}`, FAILED_CHECKS);
      throw notVerified();
    }
    return { id: partner.id, name: partner.name, registrationNumber: partner.registrationNumber };
  }

  // ------------------------------------------------------------------ helpers
  /** A code no other partner holds (8 characters from 31: a clash is vanishingly rare, but checked). */
  private async newCode(tx: Tx): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateYusrCode(this.random);
      if (!(await tx.partners.byCodeHash(this.codeHash(code)))) return code;
    }
    throw new DomainError('VALIDATION_FAILED', 'Could not issue a unique code; try again');
  }

  private async toApplication(tx: Tx, row: PartnerApplicationRow): Promise<PartnerApplication> {
    const [handler, partner] = await Promise.all([
      row.handledBy ? tx.users.byId(row.handledBy) : null,
      tx.partners.byRegistrationNumber(row.registrationNumber),
    ]);
    return {
      id: row.id,
      name: row.name,
      registrationNumber: row.registrationNumber,
      region: row.region,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
      message: row.message,
      status: row.status,
      alreadyPartner: partner !== null,
      handledBy: row.handledBy ? { id: row.handledBy, name: handler?.displayName ?? '—' } : null,
      handledAt: row.handledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async toPartner(tx: Tx, row: PartnerRow, casesCount: number): Promise<Partner> {
    const creator = await tx.users.byId(row.createdBy);
    return {
      id: row.id,
      name: row.name,
      registrationNumber: row.registrationNumber,
      region: row.region,
      contractSignedOn: row.contractSignedOn,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      status: row.status,
      yusrCode: this.deps.cipher.decrypt(row.codeCipher, `partner-code:${row.id}`),
      codeIssuedAt: row.codeIssuedAt.toISOString(),
      casesCount,
      logo: row.logoType && row.logoUpdatedAt ? { type: row.logoType, version: logoVersion(row)! } : null,
      showcased: row.showcased,
      newBadge: row.newBadge,
      createdBy: { id: row.createdBy, name: creator?.displayName ?? '—' },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
