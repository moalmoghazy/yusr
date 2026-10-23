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
  /**
   * Country calling codes (without +) that may receive codes: the countries Yusr serves. A code to any
   * other country costs money and serves nobody (SMS pumping), so it is refused.
   */
  countryCodes: readonly string[];
  /** Codes the whole platform may send per hour, whoever asks: caps the bill of a distributed attack. */
  hourlyBudget: number;
}

export const DEFAULT_OTP: Omit<OtpConfig, 'pepper'> = {
  ttlSeconds: 300,
  resendAfterSeconds: 60,
  maxAttempts: 5,
  countryCodes: ['20', '966'],
  hourlyBudget: 1_000,
};

interface StoredCode {
  hash: string;
  attempts: number;
  expiresAt: number;
}

/**
 * Phone sign-in codes: 6 digits, 5 minutes, 5 attempts, one resend per minute,
 * rate-limited per phone (from one IP and overall), per IP and platform-wide, and only to the
 * countries Yusr serves. A code works once.
 *
 * Limits that a stranger could exhaust for someone else's phone are keyed by phone *and* IP, with a
 * higher ceiling per phone alone, so nobody can lock a donor out from a single address.
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

  /** Whether codes may be sent to this E.164 number (a served country). */
  servesPhone(phone: string): boolean {
    return this.config.countryCodes.some((code) => phone.startsWith(`+${code}`));
  }

  async request(
    phone: string,
    context: { ip: string | null; locale: Locale },
  ): Promise<{ expiresInSeconds: number; resendInSeconds: number; demoCode?: string }> {
    if (!this.servesPhone(phone)) {
      throw new DomainError('VALIDATION_FAILED', 'Sign-in codes are sent to Egyptian and Saudi numbers only', {
        field: 'phone',
        issues: [{ path: 'phone', code: 'unsupported_country', message: 'Unsupported country' }],
        fields: ['phone'],
      });
    }
    // A request during the cooldown is refused before it counts against any limit.
    const cooldown = await this.kv.ttl(`otp:cooldown:${phone}`);
    if (cooldown > 0) throw new DomainError('RATE_LIMITED', 'Wait before requesting another code', { retryAfterSeconds: cooldown });
    if (context.ip) await this.limiter.consume(`otp:ip:${context.ip}`, RATE_RULES.otpPerIp);
    // Claims the cooldown atomically: of two simultaneous requests only one sends a code.
    const claimed = await this.kv.set(`otp:cooldown:${phone}`, '1', { ttlSeconds: this.config.resendAfterSeconds, onlyIfAbsent: true });
    if (!claimed) {
      throw new DomainError('RATE_LIMITED', 'Wait before requesting another code', {
        retryAfterSeconds: Math.max(1, await this.kv.ttl(`otp:cooldown:${phone}`)),
      });
    }
    await this.limiter.consume(`otp:phone-ip:${phone}:${context.ip ?? 'none'}`, RATE_RULES.otpPerPhoneAndIp);
    await this.limiter.consume(`otp:phone:${phone}`, RATE_RULES.otpPerPhone);
    await this.limiter.consume('otp:global', { limit: this.config.hourlyBudget, windowSeconds: 3_600 });

    const code = this.generate();
    const stored: StoredCode = { hash: this.hash(phone, code), attempts: 0, expiresAt: this.clock.now().getTime() + this.config.ttlSeconds * 1000 };
    await this.kv.set(`otp:code:${phone}`, JSON.stringify(stored), { ttlSeconds: this.config.ttlSeconds });
    await this.sender.sendOtp(phone, code, context.locale);
    return { expiresInSeconds: this.config.ttlSeconds, resendInSeconds: this.config.resendAfterSeconds, ...(this.config.revealCode ? { demoCode: code } : {}) };
  }

  /** Consumes the code. Throws OTP_EXPIRED, OTP_INVALID (with attempts left) or RATE_LIMITED. */
  async verify(phone: string, code: string, ip: string | null = null): Promise<void> {
    await this.limiter.consume(`otp:verify-ip:${phone}:${ip ?? 'none'}`, RATE_RULES.otpVerifyPerPhoneAndIp);
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
