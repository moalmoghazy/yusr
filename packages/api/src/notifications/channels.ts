import { maskRecipient, redactReceiptTokens, type Locale, type MessageChannel, type SentMessage } from '@yusr/core';
import type { OtpSender } from '../auth/otp.service';
import type { FetchLike } from '../payments/gateway';
import { mask } from '../common/crypto';
import { callJson } from '../payments/http';
import { templates } from './templates';

/** What a message is about; providers ignore it, the demo outbox («الرسائل المرسلة») shows it. */
export interface MessageMeta {
  template?: string;
  donationId?: string | null;
  caseId?: string | null;
}

/** Outgoing channels. Each call is idempotent at the worker level (outbox event id). */
export interface Channels {
  email(to: string, subject: string, text: string, meta?: MessageMeta): Promise<void>;
  sms(to: string, text: string, meta?: MessageMeta): Promise<void>;
  whatsapp(to: string, text: string, meta?: MessageMeta): Promise<void>;
  push(userId: string, title: string, body: string, data: Record<string, string>): Promise<void>;
}

export const CHANNELS = Symbol('CHANNELS');

export interface HttpChannelsConfig {
  email?: { apiKey: string; from: string };
  sms?: { url: string; token: string; sender?: string };
  whatsapp?: { phoneNumberId: string; token: string };
  expo?: { accessToken: string; tokensFor: (userId: string) => Promise<string[]> };
}

/**
 * HTTP implementations: Resend for email, a generic SMS gateway (Egyptian and Saudi
 * aggregators expose the same shape), the WhatsApp Cloud API, and Expo push.
 * Channels without configuration are skipped silently so staging can run with a subset.
 */
export class HttpChannels implements Channels, OtpSender {
  constructor(
    private readonly config: HttpChannelsConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  /** Which channels have a provider set up. */
  get configured(): Readonly<Record<'email' | 'sms' | 'whatsapp', boolean>> {
    return { email: Boolean(this.config.email), sms: Boolean(this.config.sms), whatsapp: Boolean(this.config.whatsapp) };
  }

  async email(to: string, subject: string, text: string) {
    if (!this.config.email) return;
    await callJson(this.fetchImpl, 'email', 'https://api.resend.com/emails', {
      headers: { authorization: `Bearer ${this.config.email.apiKey}` },
      body: { from: this.config.email.from, to: [to], subject, text },
    });
  }

  async sms(to: string, text: string) {
    if (!this.config.sms) return;
    await callJson(this.fetchImpl, 'sms', this.config.sms.url, {
      headers: { authorization: `Bearer ${this.config.sms.token}` },
      body: { to, text, sender: this.config.sms.sender ?? 'Yusr' },
    });
  }

  async whatsapp(to: string, text: string) {
    if (!this.config.whatsapp) return;
    await callJson(this.fetchImpl, 'whatsapp', `https://graph.facebook.com/v21.0/${this.config.whatsapp.phoneNumberId}/messages`, {
      headers: { authorization: `Bearer ${this.config.whatsapp.token}` },
      body: { messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'text', text: { body: text } },
    });
  }

  async push(userId: string, title: string, body: string, data: Record<string, string>) {
    if (!this.config.expo) return;
    const tokens = await this.config.expo.tokensFor(userId);
    if (!tokens.length) return;
    await callJson(this.fetchImpl, 'expo', 'https://exp.host/--/api/v2/push/send', {
      headers: { authorization: `Bearer ${this.config.expo.accessToken}` },
      body: tokens.map((token) => ({ to: token, title, body, data, sound: 'default' })),
    });
  }

  /** By SMS when an SMS provider is configured, otherwise by WhatsApp. */
  async sendOtp(phone: string, code: string, locale: Locale) {
    const text = templates.otp(locale, code).short;
    if (this.config.sms) await this.sms(phone, text);
    else if (this.config.whatsapp) await this.whatsapp(phone, text);
    else throw new Error('No SMS or WhatsApp provider is configured for sign-in codes');
  }
}

export interface LogChannelsOptions {
  /**
   * Print recipients and sign-in codes in full. Only on a developer's machine, where the terminal is
   * how a developer signs in; anywhere else (a public demo) they are masked.
   */
  reveal?: boolean;
  /** How many recent messages `sent` keeps (oldest dropped first). */
  keep?: number;
  now?: () => Date;
}

/** A message as the development channels keep it, recipient in full (in memory only; printed masked unless `reveal`). */
export interface LoggedMessage {
  id: number;
  at: Date;
  channel: MessageChannel;
  to: string;
  subject: string | null;
  /** The body (email), the message (SMS, WhatsApp) or the body of a push. */
  text: string;
  template: string | null;
  donationId: string | null;
  caseId: string | null;
  delivery: SentMessage['delivery'];
  error: string | null;
}

/** Development channels: print what would be sent. */
export class LogChannels implements Channels, OtpSender {
  /** The most recent messages, for tests, local tooling and the demo outbox; capped so a long-running process does not grow. */
  readonly sent: LoggedMessage[] = [];
  private readonly reveal: boolean;
  private readonly keep: number;
  private readonly now: () => Date;
  private counter = 0;

  constructor(
    // eslint-disable-next-line no-console -- the development channel prints messages instead of sending them
    private readonly log: (line: string) => void = (line) => console.log(line),
    options: LogChannelsOptions = {},
  ) {
    this.reveal = options.reveal ?? false;
    this.keep = Math.max(1, options.keep ?? 200);
    this.now = options.now ?? (() => new Date());
  }

  /** Keeps the message and prints one line; returns the kept entry so a caller can note how delivery went. */
  record(channel: MessageChannel, to: string, text: string, options: MessageMeta & { subject?: string | null; secret?: string } = {}): LoggedMessage {
    this.counter += 1;
    const entry: LoggedMessage = {
      id: this.counter,
      at: this.now(),
      channel,
      to,
      subject: options.subject ?? null,
      text,
      template: options.template ?? null,
      donationId: options.donationId ?? null,
      caseId: options.caseId ?? null,
      delivery: 'logged',
      error: null,
    };
    this.sent.push(entry);
    if (this.sent.length > this.keep) this.sent.splice(0, this.sent.length - this.keep);
    let line = options.subject ?? text.split('\n')[0] ?? '';
    if (!this.reveal && options.secret) line = line.split(options.secret).join('•'.repeat(options.secret.length));
    this.log(`[${channel}] → ${this.reveal ? to : mask(to)}: ${line}`);
    return entry;
  }

  async email(to: string, subject: string, text: string, meta?: MessageMeta) {
    this.record('email', to, text, { ...meta, subject });
  }
  async sms(to: string, text: string, meta?: MessageMeta) {
    this.record('sms', to, text, meta);
  }
  async whatsapp(to: string, text: string, meta?: MessageMeta) {
    this.record('whatsapp', to, text, meta);
  }
  async push(userId: string, title: string) {
    this.record('push', userId, title);
  }
  async sendOtp(phone: string, code: string, locale: Locale) {
    this.record('sms', phone, templates.otp(locale, code).short, { secret: code, template: 'otp' });
  }

  /**
   * The demo outbox («الرسائل المرسلة»), newest first: recipients masked, receipt tokens hidden. Sign-in
   * codes are left out (the demo shows them on screen), and so is push (its recipient is an account).
   */
  history(limit = 100): SentMessage[] {
    const entries = this.sent.filter((entry) => entry.channel !== 'push' && entry.template !== 'otp');
    return entries
      .slice(-Math.max(1, Math.min(limit, this.keep)))
      .reverse()
      .map((entry) => {
        return {
          id: String(entry.id),
          at: entry.at.toISOString(),
          channel: entry.channel,
          to: maskRecipient(entry.to),
          subject: entry.subject === null ? null : redactReceiptTokens(entry.subject),
          text: redactReceiptTokens(entry.text),
          template: entry.template,
          donationId: entry.donationId,
          caseId: entry.caseId,
          delivery: entry.delivery,
          error: entry.error,
        };
      });
  }
}

/**
 * The demo's channels: every message is kept for the hub's «الرسائل المرسلة» page and, for a channel
 * whose provider is set up (Resend, the WhatsApp Cloud API…), also really sent — so a demo can be tried
 * on a real phone or inbox for free. Sign-in codes never go out (the demo shows them on screen), and a
 * provider's refusal is noted on the entry rather than retried: a test recipient missing from the
 * provider's allow-list must not hold up the outbox.
 */
export class DemoChannels implements Channels, OtpSender {
  constructor(
    readonly log: LogChannels,
    private readonly real: HttpChannels | null,
    private readonly onError: (line: string) => void = () => undefined,
  ) {}

  get sent(): LoggedMessage[] {
    return this.log.sent;
  }

  history(limit?: number): SentMessage[] {
    return this.log.history(limit);
  }

  async email(to: string, subject: string, text: string, meta?: MessageMeta) {
    const entry = this.log.record('email', to, text, { ...meta, subject });
    if (this.real?.configured.email) await this.forward(entry, (real) => real.email(to, subject, text));
  }
  async sms(to: string, text: string, meta?: MessageMeta) {
    const entry = this.log.record('sms', to, text, meta);
    if (this.real?.configured.sms) await this.forward(entry, (real) => real.sms(to, text));
  }
  async whatsapp(to: string, text: string, meta?: MessageMeta) {
    const entry = this.log.record('whatsapp', to, text, meta);
    if (this.real?.configured.whatsapp) await this.forward(entry, (real) => real.whatsapp(to, text));
  }
  async push(userId: string, title: string) {
    await this.log.push(userId, title);
  }
  async sendOtp(phone: string, code: string, locale: Locale) {
    await this.log.sendOtp(phone, code, locale);
  }

  private async forward(entry: LoggedMessage, send: (real: HttpChannels) => Promise<void>) {
    try {
      await send(this.real!);
      entry.delivery = 'sent';
    } catch (error) {
      entry.delivery = 'failed';
      // The provider's status only: a response body can name the recipient.
      entry.error = (error as Error).message.slice(0, 120);
      this.onError(`[${entry.channel}] demo delivery failed: ${entry.error}`);
    }
  }
}
