import type { Clock } from './clock';

/**
 * The small slice of Redis the API uses: short-lived values (OTP codes, cooldowns)
 * and fixed-window counters (rate limits). Redis in production, memory in tests.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  /** Returns false when `onlyIfAbsent` is set and the key already exists. */
  set(key: string, value: string, options: { ttlSeconds: number; onlyIfAbsent?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Increments a counter; the expiry is fixed when the counter is created (fixed window). */
  incr(key: string, ttlSeconds: number): Promise<{ value: number; ttlSeconds: number }>;
  /** Seconds left, or -2 when the key does not exist. */
  ttl(key: string): Promise<number>;
}

export const KEY_VALUE_STORE = Symbol('KEY_VALUE_STORE');

export class MemoryKv implements KeyValueStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly clock: Clock) {}

  private live(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock.now().getTime()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, options: { ttlSeconds: number; onlyIfAbsent?: boolean }) {
    if (options.onlyIfAbsent && this.live(key)) return false;
    this.entries.set(key, { value, expiresAt: this.clock.now().getTime() + options.ttlSeconds * 1000 });
    return true;
  }

  async del(key: string) {
    this.entries.delete(key);
  }

  async incr(key: string, ttlSeconds: number) {
    const entry = this.live(key);
    if (!entry) {
      this.entries.set(key, { value: '1', expiresAt: this.clock.now().getTime() + ttlSeconds * 1000 });
      return { value: 1, ttlSeconds };
    }
    entry.value = String(Number(entry.value) + 1);
    return { value: Number(entry.value), ttlSeconds: Math.ceil((entry.expiresAt - this.clock.now().getTime()) / 1000) };
  }

  async ttl(key: string) {
    const entry = this.live(key);
    return entry ? Math.ceil((entry.expiresAt - this.clock.now().getTime()) / 1000) : -2;
  }
}

/** The ioredis methods RedisKv needs (kept structural so tests never load ioredis). */
/** A MULTI block: each command returns the pipeline so calls chain, as in ioredis. */
export interface RedisPipeline {
  incr(key: string): RedisPipeline;
  expire(key: string, seconds: number, mode: 'NX'): RedisPipeline;
  ttl(key: string): RedisPipeline;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  ttl(key: string): Promise<number>;
  multi(): RedisPipeline;
}

export class RedisKv implements KeyValueStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly prefix = 'yusr:',
  ) {}

  get(key: string) {
    return this.redis.get(this.prefix + key);
  }

  async set(key: string, value: string, options: { ttlSeconds: number; onlyIfAbsent?: boolean }) {
    const args: Array<string | number> = ['EX', options.ttlSeconds];
    if (options.onlyIfAbsent) args.push('NX');
    return (await this.redis.set(this.prefix + key, value, ...args)) === 'OK';
  }

  async del(key: string) {
    await this.redis.del(this.prefix + key);
  }

  async incr(key: string, ttlSeconds: number) {
    const name = this.prefix + key;
    // EXPIRE … NX (Redis 7) only sets the TTL when the counter is new: a true fixed window.
    const results = await this.redis.multi().incr(name).expire(name, ttlSeconds, 'NX').ttl(name).exec();
    const value = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? ttlSeconds);
    return { value, ttlSeconds: ttl > 0 ? ttl : ttlSeconds };
  }

  ttl(key: string) {
    return this.redis.ttl(this.prefix + key);
  }
}
