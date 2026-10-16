import type { Locale } from '@yusr/core';
import type { OtpSender } from '../auth/otp.service';
import type { FetchLike } from '../payments/gateway';
import { callJson } from '../payments/http';
import { templates } from './templates';

/** Outgoing channels. Each call is idempotent at the worker level (outbox event id). */
export interface Channels {
  email(to: string, subject: string, text: string): Promise<void>;
  sms(to: string, text: string): Promise<void>;
  whatsapp(to: string, text: string): Promise<void>;
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

  async sendOtp(phone: string, code: string, locale: Locale) {
    await this.sms(phone, templates.otp(locale, code).short);
  }
}

/** Development channels: print what would be sent. */
export class LogChannels implements Channels, OtpSender {
  readonly sent: Array<{ channel: string; to: string; text: string }> = [];

  // eslint-disable-next-line no-console -- the development channel prints messages instead of sending them
  constructor(private readonly log: (line: string) => void = (line) => console.log(line)) {}

  private record(channel: string, to: string, text: string) {
    this.sent.push({ channel, to, text });
    this.log(`[${channel}] → ${to}: ${text.split('\n')[0]}`);
  }

  async email(to: string, subject: string) {
    this.record('email', to, subject);
  }
  async sms(to: string, text: string) {
    this.record('sms', to, text);
  }
  async whatsapp(to: string, text: string) {
    this.record('whatsapp', to, text);
  }
  async push(userId: string, title: string) {
    this.record('push', userId, title);
  }
  async sendOtp(phone: string, code: string, locale: Locale) {
    this.record('sms', phone, templates.otp(locale, code).short);
  }
}
