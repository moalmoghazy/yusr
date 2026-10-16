import { randomBytes } from 'node:crypto';

export type IdGenerator = () => string;

/**
 * UUIDv7 (RFC 9562): 48-bit millisecond timestamp + randomness. Time-ordered ids keep
 * B-tree indexes compact and make "newest first" cheap, unlike random v4 ids.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i += 1) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const newId: IdGenerator = () => uuidv7();

/** Deterministic ids for tests: 00000000-0000-7000-8000-000000000001, …002 … */
export function sequentialIds(prefix = '00000000-0000-7000-8000-'): IdGenerator {
  let next = 0;
  return () => `${prefix}${String((next += 1)).padStart(12, '0')}`;
}
