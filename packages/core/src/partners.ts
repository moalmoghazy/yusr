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

/** Image types a partner's logo may have (the hub shrinks photos to WebP before upload). */
export const PARTNER_LOGO_TYPES = ['image/svg+xml', 'image/webp', 'image/png', 'image/jpeg'] as const;
export type PartnerLogoType = (typeof PARTNER_LOGO_TYPES)[number];
/** The largest logo the API keeps, in bytes. */
export const PARTNER_LOGO_MAX_BYTES = 150 * 1024;
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
  /** Its logo for the home page's «شركاء يُسر», or null; `version` changes with every upload. */
  logo: { type: PartnerLogoType; version: string } | null;
  /** Shown in «شركاء يُسر» on the website (active partners only). */
  showcased: boolean;
  /** The small «جديد» badge on its logo there. */
  newBadge: boolean;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

/**
 * A partner as donors see it in the home page's «شركاء يُسر»: public facts only (name, رقم الإشهار,
 * region, when it joined and how many of its cases were published). No contact details, no code.
 */
export interface PublicPartner {
  id: string;
  name: string;
  registrationNumber: string;
  region: string;
  /** The day its contract with Yusr was signed (YYYY-MM-DD). */
  joinedOn: string;
  /** Its published, funded and closed cases. */
  casesCount: number;
  /** Changes with every new logo (for cache busting); null when it has none. */
  logoVersion: string | null;
  /** Staff switched on the «جديد» badge for it. */
  isNew: boolean;
}

/**
 * Checks an uploaded logo's bytes against its declared type. SVG must be plain drawing: no scripts,
 * event handlers, external references or embedded HTML (it is also served with a sandboxing CSP).
 */
export function partnerLogoProblem(type: PartnerLogoType, bytes: Uint8Array): string | null {
  if (bytes.length === 0) return 'The file is empty';
  if (bytes.length > PARTNER_LOGO_MAX_BYTES) return `The logo is larger than ${PARTNER_LOGO_MAX_BYTES / 1024} KB`;
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  switch (type) {
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47) ? null : 'Not a PNG file';
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff) ? null : 'Not a JPEG file';
    case 'image/webp':
      return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? null : 'Not a WebP file';
    case 'image/svg+xml': {
      const text = new TextDecoder().decode(bytes);
      if (!/<svg[\s>]/i.test(text)) return 'Not an SVG file';
      if (/<script|<foreignObject|<iframe|<object|<embed|\bon[a-z]+\s*=|javascript:|<!ENTITY|xlink:href\s*=\s*["'](?!#)|\bhref\s*=\s*["'](?!#)/i.test(text)) {
        return 'The SVG has scripts or external links';
      }
      return null;
    }
  }
}

/** A request to join from an association (the website's «انضم كجمعية شريكة»), until staff handle it. */
export const PARTNER_APPLICATION_STATUSES = ['new', 'contacted', 'approved', 'rejected'] as const;
export type PartnerApplicationStatus = (typeof PARTNER_APPLICATION_STATUSES)[number];

/** A join request as staff with `partners:manage` see it. Contact details are staff only. */
export interface PartnerApplication {
  id: string;
  name: string;
  registrationNumber: string;
  region: string;
  contactName: string;
  /** E.164. */
  contactPhone: string;
  contactEmail: string | null;
  message: string | null;
  status: PartnerApplicationStatus;
  /** Already in the approved registry under this رقم الإشهار. */
  alreadyPartner: boolean;
  handledBy: { id: string; name: string } | null;
  handledAt: string | null;
  createdAt: string;
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
