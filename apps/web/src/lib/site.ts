/**
 * Site settings an operator changes without touching components (NEXT_PUBLIC_* values are compiled
 * in at build time, so change them in the host's settings and redeploy).
 *
 * `demo`: a public demo (NEXT_PUBLIC_DEMO=true) — a banner on every page says the cases are
 * fictional and no money is charged, and search engines are asked not to index it.
 *
 * `supervision`: the regulator line above the hero's eyebrow. It states official supervision,
 * so it is on only when the operating association is registered with the Ministry of Social
 * Solidarity; the registration number, when set, is shown with it so donors can verify it.
 * A demo hides it unless NEXT_PUBLIC_SHOW_SUPERVISION is explicitly "true".
 *
 * `whatsapp`: the number the floating WhatsApp button opens a chat with (NEXT_PUBLIC_WHATSAPP_NUMBER,
 * international digits without "+"); empty turns the button off.
 *
 * `contact`: the phone and emails on «تواصل معنا» and the privacy policy. The defaults are
 * placeholders until the real ones exist; set NEXT_PUBLIC_CONTACT_PHONE (international, e.g.
 * +20 2 2345 6789), NEXT_PUBLIC_CONTACT_EMAIL and NEXT_PUBLIC_PRIVACY_EMAIL.
 */
const demo = process.env['NEXT_PUBLIC_DEMO'] === 'true';
const supervisionSetting = process.env['NEXT_PUBLIC_SHOW_SUPERVISION'];

export const site = {
  demo,
  supervision: {
    enabled: supervisionSetting === 'true' || (!demo && supervisionSetting !== 'false'),
    registrationNumber: process.env['NEXT_PUBLIC_MOSS_REGISTRATION_NUMBER'] || null,
  },
  contact: {
    phone: process.env['NEXT_PUBLIC_CONTACT_PHONE'] || '+20 2 2345 6789',
    email: process.env['NEXT_PUBLIC_CONTACT_EMAIL'] || 'help@yusr.example',
    privacyEmail: process.env['NEXT_PUBLIC_PRIVACY_EMAIL'] || 'privacy@yusr.example',
  },
  whatsapp: (process.env['NEXT_PUBLIC_WHATSAPP_NUMBER'] ?? '201000665133').replace(/\D/g, '') || null,
} as const;
