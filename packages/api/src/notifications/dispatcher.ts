/**
 * Turns committed domain events (outbox rows) into messages and integrations.
 * Handlers must be idempotent: the worker retries a failed event, so a handler may
 * run more than once for the same event (the in-app notification id is derived from
 * the event id to avoid duplicates).
 */
import type { ContactChannel, Locale, Localized } from '@yusr/core';
import { sha256Hex } from '../common/crypto';
import type { Database } from '../db/ports';
import type { DonationRow, GuestContact, OutboxRow } from '../db/rows';
import { Analytics, amountBand } from '../integrations/posthog';
import type { BaserowClient } from '../integrations/baserow';
import type { SlackNotifier } from '../integrations/slack';
import type { Channels } from './channels';
import { templates, type Rendered } from './templates';

export interface DispatcherDeps {
  db: Database;
  channels: Channels;
  slack: SlackNotifier;
  baserow: BaserowClient;
  analytics: Analytics;
  links: { web: string; admin: string };
  /** The receipt page for a gift, with the token that opens it (DonationsService.receiptLink). */
  receiptLink: (donationId: string, locale: Locale) => string;
  clock: () => Date;
}

/** Who a message about a gift goes to, and where they asked to receive it. */
interface Recipient {
  userId: string | null;
  guest: GuestContact | null;
  donationId: string | null;
  contactChannel: ContactChannel | null;
  caseId: string | null;
}

type Handler = (event: OutboxRow) => Promise<void>;

/** Deterministic id per (event, recipient, channel) so a retried event does not notify twice. */
function notificationId(eventId: number, recipient: string, channel: string): string {
  const hex = sha256Hex(`${eventId}:${recipient}:${channel}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export class Dispatcher {
  private readonly handlers: Readonly<Record<string, Handler>>;

  constructor(private readonly deps: DispatcherDeps) {
    this.handlers = {
      'donation.succeeded': (event) => this.onDonationSucceeded(event),
      'donation.failed': (event) => this.onDonationUnfinished(event),
      'donation.expired': (event) => this.onDonationUnfinished(event),
      'case.funded': (event) => this.onCaseFunded(event),
      'case.closed': (event) => this.onCaseClosed(event),
      'payout.paid': (event) => this.onPayoutPaid(event),
      'refund.processed': (event) => this.onRefund(event),
      'case.submitted': (event) => this.onCaseSubmitted(event),
      'partner.applied': (event) => this.onPartnerApplied(event),
      'verification.assigned': (event) => this.onVisitAssigned(event),
      'finance.review_needed': (event) => this.onReviewNeeded(event),
    };
  }

  handles(type: string): boolean {
    return type in this.handlers || type.startsWith('case.');
  }

  async dispatch(event: OutboxRow): Promise<void> {
    const handler = this.handlers[event.type];
    if (handler) await handler(event);
    // Other case.* transitions only feed analytics.
    if (event.type.startsWith('case.')) await this.deps.analytics.capture(event.type, String(event.payload['caseId'] ?? event.aggregateId));
  }

  /**
   * Delivers to a registered donor (in-app + push) or a guest, then to the channel the donor chose for
   * the gift («طريقة التواصل المفضلة»: WhatsApp or email). Gifts made before that was asked fall back
   * to email first, else SMS (registered) or WhatsApp (guest).
   */
  private async deliver(event: OutboxRow, recipient: Recipient, locale: Locale, template: string, message: Rendered, data: Record<string, string>) {
    const { db, channels, clock } = this.deps;
    const meta = { template, donationId: recipient.donationId, caseId: recipient.caseId };
    const user = recipient.userId ? await db.read.users.byId(recipient.userId) : null;
    if (recipient.userId && !user) return;
    if (user) {
      await db.transaction((tx) =>
        tx.notifications.insert({
          id: notificationId(event.id, user.id, 'in_app'),
          userId: user.id,
          donationId: recipient.donationId,
          channel: 'in_app',
          template,
          locale,
          payload: { ...data, subject: message.subject, text: message.short },
          sentAt: clock(),
          readAt: null,
          createdAt: clock(),
        }),
      );
      await channels.push(user.id, message.subject, message.short, data);
    }
    const contact = recipient.guest;
    if (recipient.contactChannel === 'whatsapp' && contact?.phone) return channels.whatsapp(contact.phone, message.text, meta);
    if (recipient.contactChannel === 'email' && contact?.email) return channels.email(contact.email, message.subject, message.text, meta);
    if (user) {
      if (user.email) await channels.email(user.email, message.subject, message.text, meta);
      else if (user.phone) await channels.sms(user.phone, message.short, meta);
      return;
    }
    if (contact?.email) await channels.email(contact.email, message.subject, message.text, meta);
    else if (contact?.phone) await channels.whatsapp(contact.phone, message.text, meta);
  }

  private recipientOf(donation: Pick<DonationRow, 'id' | 'donorId' | 'guestContact' | 'contactChannel' | 'caseId'>): Recipient {
    return {
      userId: donation.donorId,
      guest: donation.guestContact,
      donationId: donation.id,
      contactChannel: donation.contactChannel ?? null,
      caseId: donation.caseId,
    };
  }

  private async caseTitle(caseId: string): Promise<{ title: Localized; slug: string; reference: string } | null> {
    const item = await this.deps.db.read.cases.byId(caseId);
    return item ? { title: item.title, slug: item.slug, reference: item.reference } : null;
  }

  private async onDonationSucceeded(event: OutboxRow) {
    const { db, links, analytics } = this.deps;
    const donation = await db.read.donations.byId(String(event.payload['donationId']));
    const item = donation ? await this.caseTitle(donation.caseId) : null;
    if (!donation || !item) return;
    const link = `${links.web}/${donation.locale}/cases/${item.slug}?tab=transparency`;
    const message = templates.receipt(donation.locale, {
      receiptNo: donation.receiptNo,
      amountMinor: donation.netToCaseMinor,
      currency: donation.caseCurrency,
      caseTitle: item.title,
      link,
    });
    await this.deliver(event, this.recipientOf(donation), donation.locale, 'receipt', message, {
      receiptNo: donation.receiptNo,
      caseSlug: item.slug,
    });
    await analytics.capture('donation_succeeded', donation.id, {
      method: donation.method,
      currency: donation.currency,
      amount_band: amountBand(donation.amountMinor / 100),
      covered_fees: donation.coverFees,
      guest: donation.donorId === null,
      channel: donation.channel,
    });
  }

  private async onDonationUnfinished(event: OutboxRow) {
    const donation = await this.deps.db.read.donations.byId(String(event.payload['donationId']));
    const item = donation ? await this.caseTitle(donation.caseId) : null;
    if (!donation || !item) return;
    const message = templates.retry(donation.locale, { receiptNo: donation.receiptNo, link: `${this.deps.links.web}/${donation.locale}/cases/${item.slug}` });
    await this.deliver(event, this.recipientOf(donation), donation.locale, 'retry', message, {
      caseSlug: item.slug,
    });
  }

  private async onCaseFunded(event: OutboxRow) {
    const caseId = String(event.payload['caseId']);
    const item = await this.caseTitle(caseId);
    if (!item) return;
    for (const contact of await this.deps.db.read.donations.contactsForCase(caseId)) {
      const message = templates.funded(contact.locale, { caseTitle: item.title, link: `${this.deps.links.web}/${contact.locale}/cases/${item.slug}` });
      await this.deliver(event, this.recipientOf({ ...contact, caseId }), contact.locale, 'case_funded', message, {
        caseSlug: item.slug,
      });
    }
  }

  /**
   * «اكتملت الحالة»: a funded case is closed once everything is paid out. Every donor hears it on their
   * chosen channel, with their own receipt and the case's transparency tab. Nothing names a donor, so
   * anonymous gifts are told too (privately). A case closed early (from published or paused, with a
   * reason) is not "complete" and sends nothing here.
   */
  private async onCaseClosed(event: OutboxRow) {
    if (event.payload['from'] !== 'funded') return;
    const caseId = String(event.payload['caseId']);
    const item = await this.caseTitle(caseId);
    if (!item) return;
    for (const contact of await this.deps.db.read.donations.contactsForCase(caseId)) {
      const message = templates.closed(contact.locale, {
        caseTitle: item.title,
        receiptLink: this.deps.receiptLink(contact.id, contact.locale),
        transparencyLink: `${this.deps.links.web}/${contact.locale}/cases/${item.slug}?tab=transparency`,
      });
      await this.deliver(event, this.recipientOf({ ...contact, caseId }), contact.locale, 'case_closed', message, { caseSlug: item.slug });
    }
  }

  private async onPayoutPaid(event: OutboxRow) {
    const caseId = String(event.payload['caseId']);
    const item = await this.caseTitle(caseId);
    if (!item) return;
    const payee = (event.payload['payee'] as Localized | null) ?? { ar: 'الجهة المستفيدة', en: 'the institution' };
    for (const contact of await this.deps.db.read.donations.contactsForCase(caseId)) {
      const message = templates.disbursed(contact.locale, {
        caseTitle: item.title,
        payee,
        amountMinor: Number(event.payload['amountMinor']),
        currency: event.payload['currency'] as 'EGP',
        link: `${this.deps.links.web}/${contact.locale}/cases/${item.slug}?tab=transparency`,
      });
      await this.deliver(event, this.recipientOf({ ...contact, caseId }), contact.locale, 'disbursed', message, {
        caseSlug: item.slug,
      });
    }
    await this.deps.slack.post('finance', `:white_check_mark: Payout paid for ${item.reference}`, {
      Amount: String(Number(event.payload['amountMinor']) / 100),
    });
  }

  private async onRefund(event: OutboxRow) {
    const donation = await this.deps.db.read.donations.byId(String(event.payload['donationId']));
    if (!donation) return;
    const message = templates.refunded(donation.locale, {
      receiptNo: donation.receiptNo,
      amountMinor: Number(event.payload['amountMinor']),
      currency: donation.currency,
    });
    await this.deliver(event, this.recipientOf(donation), donation.locale, 'refund', message, {
      receiptNo: donation.receiptNo,
    });
  }

  private async onCaseSubmitted(event: OutboxRow) {
    const payload = event.payload;
    const flags = [payload['urgent'] ? ':rotating_light: urgent' : null, payload['possibleDuplicate'] ? ':warning: possible duplicate beneficiary' : null]
      .filter(Boolean)
      .join(' · ');
    await this.deps.slack.post('fieldOps', `New case *${String(payload['reference'])}* waiting for review ${flags}`.trim(), {
      Category: String(payload['category']),
      Region: String(payload['region']),
      Open: `${this.deps.links.admin}/cases/${String(payload['caseId'])}`,
    });
  }

  private async onPartnerApplied(event: OutboxRow) {
    const payload = event.payload;
    await this.deps.slack.post('fieldOps', `New partner request from *${String(payload['name'])}*`, {
      'Registration number': String(payload['registrationNumber']),
      Region: String(payload['region']),
      Open: `${this.deps.links.admin}/partners`,
    });
  }

  private async onVisitAssigned(event: OutboxRow) {
    const { db, baserow, links } = this.deps;
    const task = await db.read.verification.byId(String(event.payload['taskId']));
    if (!task) return;
    const auditor = await db.read.users.byId(task.auditorId);
    const rowId = await baserow.upsertVisit(
      {
        reference: String(event.payload['reference']),
        region: String(event.payload['region']),
        auditor: auditor?.displayName ?? task.auditorId,
        visitAt: task.visitAt?.toISOString() ?? null,
        status: task.status === 'completed' ? 'completed' : task.status === 'scheduled' ? 'scheduled' : 'assigned',
        adminUrl: `${links.admin}/verification/${task.id}`,
      },
      task.baserowRowId,
    );
    if (rowId && rowId !== task.baserowRowId) await db.transaction((tx) => tx.verification.update(task.id, { baserowRowId: rowId }));
    if (auditor?.phone)
      await this.deps.channels.sms(auditor.phone, `Yusr: new field visit ${String(event.payload['reference'])} (${String(event.payload['region'])})`);
  }

  private async onReviewNeeded(event: OutboxRow) {
    await this.deps.slack.post('finance', `:mag: Donation needs review (${String(event.payload['reason'])})`, {
      Donation: String(event.payload['donationId']),
      Open: `${this.deps.links.admin}/finance/donations/${String(event.payload['donationId'])}`,
    });
  }
}

export { Analytics };
