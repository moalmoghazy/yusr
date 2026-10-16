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
  otpPerPhone: { limit: 5, windowSeconds: 3_600 },
  otpPerIp: { limit: 20, windowSeconds: 3_600 },
  otpVerifyPerPhone: { limit: 10, windowSeconds: 900 },
  donationsPerIp: { limit: 30, windowSeconds: 600 },
  webhooksPerProvider: { limit: 600, windowSeconds: 60 },
} as const satisfies Record<string, RateRule>;
