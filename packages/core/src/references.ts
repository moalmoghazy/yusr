/** Crockford base32 — no I, L, O, U, so codes survive being read aloud or handwritten. */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type RandomSource = (bytes: number) => Uint8Array;

export const cryptoRandom: RandomSource = (bytes) => {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return buffer;
};

export function randomCode(length: number, random: RandomSource = cryptoRandom): string {
  const bytes = random(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CROCKFORD_ALPHABET[(bytes[i] ?? 0) % 32];
  return out;
}

export function randomDigits(length: number, random: RandomSource = cryptoRandom): string {
  const bytes = random(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += String((bytes[i] ?? 0) % 10);
  return out;
}

/** YSR-2026-000123 — sequential per year, printed on receipts and tax statements. */
export function formatReceiptNumber(year: number, sequence: number): string {
  return `YSR-${year}-${String(sequence).padStart(6, '0')}`;
}

/** YSR-10482 — public case reference. */
export function formatCaseReference(sequence: number): string {
  return `YSR-${sequence}`;
}

/** Groups long numeric references for reading: 987654321 → "987 654 321". */
export function groupDigits(value: string, size = 3): string {
  return value.replace(new RegExp(`(\\d{${size}})(?=\\d)`, 'g'), '$1 ');
}
