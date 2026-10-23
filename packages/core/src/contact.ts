import type { Role } from './types';

/**
 * How a donor wants to hear from us: the receipt, «اكتمل التمويل», the payout proof and the
 * case-closed message all go to this one channel. Phone numbers are WhatsApp numbers (E.164).
 */
export const CONTACT_CHANNELS = ['whatsapp', 'email'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** Every way the platform can send a message (the demo's «الرسائل المرسلة» page lists them all). */
export type MessageChannel = 'email' | 'sms' | 'whatsapp' | 'push';

/**
 * A message the platform sent — or, on demo data, would have sent. Only in demo mode, for staff
 * who own content and support. The recipient is always masked.
 */
export interface SentMessage {
  id: string;
  at: string;
  channel: MessageChannel;
  /** Masked: «mo•••@example.com», «+20•••••4567». */
  to: string;
  subject: string | null;
  text: string;
  /** receipt, case_funded, disbursed, case_closed, otp… */
  template: string | null;
  donationId: string | null;
  caseId: string | null;
  /** logged: recorded only (no provider set up); sent / failed: a real provider was called too. */
  delivery: 'logged' | 'sent' | 'failed';
  /** Why a real provider refused it (status only, e.g. «whatsapp responded 400»). */
  error: string | null;
}

/** Who may open the demo outbox. */
export const SENT_MESSAGES_ROLES: readonly Role[] = ['super_admin', 'content_moderator'];

export function canSeeSentMessages(roles: readonly Role[]): boolean {
  return roles.some((role) => SENT_MESSAGES_ROLES.includes(role));
}

/** Masks an email or phone number for staff screens: the first two characters and the domain, or the last four digits. */
export function maskRecipient(value: string | null | undefined): string {
  if (!value) return '—';
  const at = value.indexOf('@');
  if (at > 0) return `${value.slice(0, Math.min(2, at))}•••${value.slice(at)}`;
  if (/^\+?\d{6,}$/.test(value)) {
    const plus = value.startsWith('+') ? '+' : '';
    const digits = value.replace(/^\+/, '');
    return `${plus}${digits.slice(0, 2)}${'•'.repeat(Math.max(3, digits.length - 6))}${digits.slice(-4)}`;
  }
  return `${'•'.repeat(Math.min(9, Math.max(3, value.length - 4)))}${value.slice(-4)}`;
}

/** Hides receipt tokens in a message shown to staff (a token opens the receipt without signing in). */
export function redactReceiptTokens(text: string): string {
  return text.replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1•••');
}
