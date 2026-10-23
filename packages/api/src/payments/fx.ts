import { DEMO_FX, DomainError, type Currency, type FxTable } from '@yusr/core';
import type { FetchLike } from './gateway';

/**
 * Exchange rates used when a donor pays in a different currency than the case.
 * The rate is read once and locked on the donation, so later rate moves never
 * change what a case was credited.
 */
export interface FxProvider {
  current(): FxTable;
  /** The table to convert a donation with; throws METHOD_NOT_AVAILABLE when the rates are too old to lock. */
  forConversion(): FxTable;
}

export class StaticFx implements FxProvider {
  constructor(private table: FxTable = DEMO_FX) {}

  current(): FxTable {
    return this.table;
  }

  forConversion(): FxTable {
    return this.table;
  }

  set(table: FxTable): void {
    this.table = table;
  }
}

/**
 * Polls a rates endpoint returning { reference, rates: { EGP, SAR, USD }, asOf }
 * (a small job that caches the Central Bank of Egypt / SAMA daily rates). Keeps the
 * last good table if a refresh fails, and refuses tables older than `maxAgeHours`.
 */
export class RefreshingFx implements FxProvider {
  private table: FxTable;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly options: { url: string; intervalMs?: number; maxAgeHours?: number; fallback?: FxTable },
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => number = () => Date.now(),
  ) {
    this.table = options.fallback ?? DEMO_FX;
  }

  current(): FxTable {
    return this.table;
  }

  /** The feed may stop refreshing; past `maxAgeHours` no cross-currency donation is priced on the old table. */
  forConversion(): FxTable {
    if (!this.fresh(this.table)) {
      throw new DomainError('METHOD_NOT_AVAILABLE', 'Exchange rates are out of date; donate in the case currency');
    }
    return this.table;
  }

  private fresh(table: FxTable): boolean {
    const ageHours = (this.now() - Date.parse(table.asOf)) / 3_600_000;
    return Number.isFinite(ageHours) && ageHours <= (this.options.maxAgeHours ?? 36);
  }

  async refresh(): Promise<void> {
    const response = await this.fetchImpl(this.options.url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`FX feed responded ${response.status}`);
    const next = (await response.json()) as FxTable;
    const currencies: Currency[] = ['EGP', 'SAR', 'USD'];
    if (!currencies.every((code) => typeof next.rates?.[code] === 'number' && next.rates[code] > 0)) throw new Error('FX feed is missing rates');
    if (!this.fresh(next)) throw new Error('FX feed is stale');
    this.table = next;
  }

  start(): void {
    this.stop();
    const tick = () => this.refresh().catch(() => undefined);
    void tick();
    this.timer = setInterval(tick, this.options.intervalMs ?? 3_600_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

export const FX_PROVIDER = Symbol('FX_PROVIDER');
