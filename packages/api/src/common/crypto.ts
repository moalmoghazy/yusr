import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacHex(algorithm: 'sha256' | 'sha512', key: string | Uint8Array, data: string | Uint8Array): string {
  return createHmac(algorithm, key).update(data).digest('hex');
}

/** Constant-time comparison of two strings; different lengths return false without leaking timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    // Compare against itself so the call takes similar time either way.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** URL-safe random token (default 32 bytes = 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Stable JSON: object keys sorted, so equal payloads hash equally regardless of key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

/** Masks all but the last `visible` characters: +201001234567 → •••••••••4567. */
export function mask(value: string, visible = 4): string {
  if (value.length <= visible) return value;
  return `${'•'.repeat(Math.min(9, value.length - visible))}${value.slice(-visible)}`;
}
