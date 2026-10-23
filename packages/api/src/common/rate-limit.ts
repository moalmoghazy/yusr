import { DomainError } from '@yusr/core';
import type { KeyValueStore } from './kv';

export interface RateRule {
  limit: number;
  windowSeconds: number;
}

/** Fixed-window limits on Redis. Throws RATE_LIMITED with a retry hint the client can show. */
export class RateLimiter {
  constructor(private readonly kv: KeyValueStore) {}

  async consume(key: string, rule: RateRule): Promise<{ remaining: number }> {
    const { value, ttlSeconds } = await this.kv.incr(`rl:${key}`, rule.windowSeconds);
    if (value > rule.limit) {
      throw new DomainError('RATE_LIMITED', 'Too many requests', { retryAfterSeconds: Math.max(1, ttlSeconds) });
    }
    return { remaining: rule.limit - value };
  }
}

/** Default limits, tuned for a donation platform (per phone / IP / donor). */
export const RATE_RULES = {
  /** Codes to one phone asked from one IP; otpPerPhone is the ceiling across all IPs. */
  otpPerPhoneAndIp: { limit: 5, windowSeconds: 3_600 },
  otpPerPhone: { limit: 15, windowSeconds: 3_600 },
  otpPerIp: { limit: 20, windowSeconds: 3_600 },
  /** Verification attempts for one phone from one IP; otpVerifyPerPhone is the ceiling across all IPs. */
  otpVerifyPerPhoneAndIp: { limit: 10, windowSeconds: 900 },
  otpVerifyPerPhone: { limit: 50, windowSeconds: 900 },
  donationsPerIp: { limit: 30, windowSeconds: 600 },
  webhooksPerProvider: { limit: 600, windowSeconds: 60 },
} as const satisfies Record<string, RateRule>;
