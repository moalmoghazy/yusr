import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '../common/crypto';

/** RFC 4648 base32 (what authenticator apps expect in otpauth:// URIs). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 6238 TOTP (HMAC-SHA1, 30-second steps, 6 digits) — what Google Authenticator and 1Password use. */
export function totpAt(secret: string, time: Date, step = 30, digits = 6): string {
  const counter = Math.floor(time.getTime() / 1000 / step);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The 30-second step a time falls in (the TOTP counter). */
export function totpStep(time: Date, step = 30): number {
  return Math.floor(time.getTime() / 1000 / step);
}

/**
 * Accepts the current code and one step either side (clock drift) and returns the step it matched,
 * or null. Callers remember the step so the same code cannot be used twice.
 */
export function matchTotp(secret: string, code: string, now: Date, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  let matched: number | null = null;
  for (let drift = -window; drift <= window; drift += 1) {
    const time = new Date(now.getTime() + drift * 30_000);
    // Every candidate is compared (no early exit), so timing does not reveal which one matched.
    if (safeEqual(totpAt(secret, time), code) && matched === null) matched = totpStep(time);
  }
  return matched;
}

/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(secret: string, code: string, now: Date, window = 1): boolean {
  return matchTotp(secret, code, now, window) !== null;
}

export function otpauthUri(secret: string, account: string, issuer = 'Yusr'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
