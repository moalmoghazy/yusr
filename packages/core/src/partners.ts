/**
 * The approved-partner registry: the جمعيات أهلية (registered with the Ministry of Social Solidarity)
 * that Yusr has approved, coordinated with and signed a contract with. Only their cases are listed.
 *
 * Each partner holds a «كود يُسر» issued by the platform: with its registration number (رقم الإشهار)
 * it lets anyone from the association submit a case, without a donor account. The code is a secret:
 * staff with `partners:manage` can read it in the control hub to hand it over, it never appears on
 * public pages, and the API compares it in constant time.
 */

export const PARTNER_STATUSES = ['active', 'suspended'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/** A partner as staff with `partners:manage` see it in the control hub. */
export interface Partner {
  id: string;
  name: string;
  /** رقم الإشهار with the Ministry of Social Solidarity; unique in the registry. */
  registrationNumber: string;
  /** ISO 3166-2 code of the governorate or region it works in, e.g. EG-C. */
  region: string;
  /** The day the contract with Yusr was signed (YYYY-MM-DD). */
  contractSignedOn: string;
  contactName: string;
  /** E.164; staff only. */
  contactPhone: string;
  status: PartnerStatus;
  /** «كود يُسر», e.g. YSR-7K2M9QXA. Staff only, never public. */
  yusrCode: string;
  codeIssuedAt: string;
  casesCount: number;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

/** What a partner's staff type to prove who they are (with their contact person's details). */
export interface PartnerCredentials {
  registrationNumber: string;
  yusrCode: string;
}

export const YUSR_CODE_PREFIX = 'YSR-';
/** Unambiguous: no 0/O, 1/I/L confusion when a code is read over the phone or copied by hand. */
export const YUSR_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const YUSR_CODE_LENGTH = 8;
export const YUSR_CODE_PATTERN = new RegExp(`^${YUSR_CODE_PREFIX}[${YUSR_CODE_ALPHABET}]{${YUSR_CODE_LENGTH}}$`);

/**
 * A new code from `randomBytes` (crypto-strong bytes from the caller: node:crypto on the server).
 * Rejection sampling keeps every character equally likely.
 */
export function generateYusrCode(randomBytes: (count: number) => Uint8Array): string {
  const size = YUSR_CODE_ALPHABET.length;
  const ceiling = 256 - (256 % size);
  let code = '';
  while (code.length < YUSR_CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte >= ceiling) continue;
      code += YUSR_CODE_ALPHABET[byte % size];
      if (code.length === YUSR_CODE_LENGTH) break;
    }
  }
  return `${YUSR_CODE_PREFIX}${code}`;
}

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;
const toAsciiDigits = (value: string) => value.replace(EASTERN_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf));

/**
 * What people type into the canonical code: «ysr 7k2m-9qxa», «7K2M9QXA» or with Arabic-Indic digits
 * all become YSR-7K2M9QXA. Look-alikes are not guessed (O stays O and fails the pattern).
 */
export function normalizeYusrCode(raw: string): string {
  const compact = toAsciiDigits(raw)
    .toUpperCase()
    .replace(/[\s\-_.‎‏]/g, '');
  const body = compact.startsWith('YSR') ? compact.slice(3) : compact;
  return `${YUSR_CODE_PREFIX}${body}`;
}

export function isYusrCode(value: string): boolean {
  return YUSR_CODE_PATTERN.test(value);
}

/** رقم الإشهار as stored and compared: ASCII digits, no spaces («١٢٣٤ / ٢٠١٩» → 1234/2019). */
export function normalizeRegistrationNumber(raw: string): string {
  return toAsciiDigits(raw).replace(/\s+/g, '').toUpperCase();
}
