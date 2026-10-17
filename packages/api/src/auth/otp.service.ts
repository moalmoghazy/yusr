import { DomainError, randomDigits, type Locale } from '@yusr/core';
import type { Clock } from '../common/clock';
import { hmacHex, safeEqual } from '../common/crypto';
import type { KeyValueStore } from '../common/kv';
import { RATE_RULES, type RateLimiter } from '../common/rate-limit';

/** Delivers a one-time code by SMS or WhatsApp (see notifications/channels.ts). */
export interface OtpSender {
  sendOtp(phone: string, code: string, locale: Locale): Promise<void>;
}

export interface OtpConfig {
  /** Public demo only: return the code in the response (no SMS is sent there). */
  revealCode?: boolean;
  /** Server-side pepper: codes are stored as HMAC(pepper, phone:code), never in plain text. */
  pepper: string;
  ttlSeconds: number;
  resendAfterSeconds: number;
  maxAttempts: number;
}

export const DEFAULT_OTP: Omit<OtpConfig, 'pepper'> = { ttlSeconds: 300, resendAfterSeconds: 60, maxAttempts: 5 };

interface StoredCode {
  hash: string;
  attempts: number;
  expiresAt: number;
}

/**
 * Phone sign-in codes: 6 digits, 5 minutes, 5 attempts, one resend per minute,
 * rate-limited per phone and per IP. A code works once.
 */
export class OtpService {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly limiter: RateLimiter,
    private readonly sender: OtpSender,
    private readonly clock: Clock,
    private readonly config: OtpConfig,
    private readonly generate: () => string = () => randomDigits(6),
  ) {}

  private hash(phone: string, code: string): string {
    return hmacHex('sha256', this.config.pepper, `${phone}:${code}`);
  }

  async request(
    phone: string,
    context: { ip: string | null; locale: Locale },
  ): Promise<{ expiresInSeconds: number; resendInSeconds: number; demoCode?: string }> {
    const cooldown = await this.kv.ttl(`otp:cooldown:${phone}`);
    if (cooldown > 0) throw new DomainError('RATE_LIMITED', 'Wait before requesting another code', { retryAfterSeconds: cooldown });
    await this.limiter.consume(`otp:phone:${phone}`, RATE_RULES.otpPerPhone);
    if (context.ip) await this.limiter.consume(`otp:ip:${context.ip}`, RATE_RULES.otpPerIp);

    const code = this.generate();
    const stored: StoredCode = { hash: this.hash(phone, code), attempts: 0, expiresAt: this.clock.now().getTime() + this.config.ttlSeconds * 1000 };
    await this.kv.set(`otp:code:${phone}`, JSON.stringify(stored), { ttlSeconds: this.config.ttlSeconds });
    await this.kv.set(`otp:cooldown:${phone}`, '1', { ttlSeconds: this.config.resendAfterSeconds });
    await this.sender.sendOtp(phone, code, context.locale);
    return { expiresInSeconds: this.config.ttlSeconds, resendInSeconds: this.config.resendAfterSeconds, ...(this.config.revealCode ? { demoCode: code } : {}) };
  }

  /** Consumes the code. Throws OTP_EXPIRED, OTP_INVALID (with attempts left) or RATE_LIMITED. */
  async verify(phone: string, code: string): Promise<void> {
    await this.limiter.consume(`otp:verify:${phone}`, RATE_RULES.otpVerifyPerPhone);
    const key = `otp:code:${phone}`;
    const raw = await this.kv.get(key);
    if (!raw) throw new DomainError('OTP_EXPIRED');
    const stored = JSON.parse(raw) as StoredCode;
    if (stored.attempts >= this.config.maxAttempts) {
      await this.kv.del(key);
      throw new DomainError('RATE_LIMITED', 'Too many wrong codes', { retryAfterSeconds: this.config.resendAfterSeconds });
    }
    if (!/^\d{6}$/.test(code) || !safeEqual(this.hash(phone, code), stored.hash)) {
      stored.attempts += 1;
      const ttlSeconds = Math.max(1, Math.ceil((stored.expiresAt - this.clock.now().getTime()) / 1000));
      await this.kv.set(key, JSON.stringify(stored), { ttlSeconds });
      throw new DomainError('OTP_INVALID', undefined, { attemptsLeft: Math.max(0, this.config.maxAttempts - stored.attempts) });
    }
    await this.kv.del(key);
  }
}
