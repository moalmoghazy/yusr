import type { FetchLike } from '../payments/gateway';

/**
 * Product analytics without personal data: events carry a pseudonymous id (the
 * donation or user uuid), amounts rounded to bands, and never names, phones or emails.
 */
export class Analytics {
  constructor(
    private readonly config: { key: string; host: string } | null,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async capture(event: string, distinctId: string, properties: Record<string, string | number | boolean | null> = {}): Promise<void> {
    if (!this.config) return;
    await this.fetchImpl(`${this.config.host.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: this.config.key, event, distinct_id: distinctId, properties: { ...properties, $lib: 'yusr-api' } }),
      signal: AbortSignal.timeout(5_000),
    });
  }
}

/** 1,250 EGP → "1k–5k": enough for funnels, useless for identifying anyone. */
export function amountBand(major: number): string {
  const bands = [100, 500, 1_000, 5_000, 20_000, 100_000];
  const upper = bands.find((limit) => major < limit);
  if (!upper) return '100k+';
  const lower = bands[bands.indexOf(upper) - 1] ?? 0;
  const label = (value: number) => (value >= 1_000 ? `${value / 1_000}k` : String(value));
  return `${label(lower)}–${label(upper)}`;
}
