/** Countries whose local mobile formats we accept (the platform's two markets). */
export type PhoneCountry = 'EG' | 'SA';

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/**
 * Turns what people type into E.164: «٠١٠٠ ١٢٣ ٤٥٦٧» or 01001234567 → +201001234567,
 * 0501234567 → +966501234567, 00… → +…. Returns null for an empty value; anything it
 * can't place is returned cleaned-up for the schema (phoneSchema) to reject with a clear message.
 */
export function toE164(raw: string | null | undefined, country: PhoneCountry | null = 'EG'): string | null {
  if (!raw) return null;
  let value = raw.replace(EASTERN_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf)).replace(/[\s\-().‎‏]/g, '');
  if (!value) return null;
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('+')) return value;
  if (country === 'EG' && /^01\d{9}$/.test(value)) return `+20${value.slice(1)}`;
  if (country === 'SA' && /^05\d{8}$/.test(value)) return `+966${value.slice(1)}`;
  return value;
}
