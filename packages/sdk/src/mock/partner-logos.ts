/**
 * Logos for the demo partner associations, keyed by رقم الإشهار. Invented for the demo (like the
 * associations themselves): simple emblems on a 64-unit grid, so «شركاء يُسر» has something to show.
 */
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;

export const DEMO_PARTNER_LOGOS: Readonly<Record<string, string>> = {
  // جمعية الرحمة: a crescent cradling a heart.
  '0001/2026': svg(
    '<circle cx="32" cy="32" r="30" fill="#E6F4F1"/>' +
      '<path d="M40 12a20 20 0 1 0 12 30A16 16 0 1 1 40 12Z" fill="#0F766E"/>' +
      '<path d="M33 40s-9-5.2-9-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.8-9 11-9 11Z" fill="#E11D48"/>',
  ),
  // جمعية سنابل الخير: three ears of wheat.
  '0002/2026': svg(
    '<circle cx="32" cy="32" r="30" fill="#FBF0D9"/>' +
      '<path d="M32 52V20M22 52c0-12 4-20 10-24M42 52c0-12-4-20-10-24" stroke="#8A5A12" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<g fill="#D99A1E"><ellipse cx="32" cy="16" rx="4" ry="7"/><ellipse cx="26" cy="26" rx="3.4" ry="6" transform="rotate(-30 26 26)"/>' +
      '<ellipse cx="38" cy="26" rx="3.4" ry="6" transform="rotate(30 38 26)"/><ellipse cx="25" cy="36" rx="3" ry="5.4" transform="rotate(-35 25 36)"/>' +
      '<ellipse cx="39" cy="36" rx="3" ry="5.4" transform="rotate(35 39 36)"/></g>',
  ),
  // جمعية يد العون: two hands meeting around a circle.
  '0003/2026': svg(
    '<rect x="2" y="2" width="60" height="60" rx="16" fill="#E3ECFA"/>' +
      '<circle cx="32" cy="26" r="8" fill="#F59E0B"/>' +
      '<path d="M10 40c6-2 12 0 16 4l6 6 6-6c4-4 10-6 16-4-4 8-12 14-22 14S14 48 10 40Z" fill="#1D4ED8"/>',
  ),
  // جمعية نور الأمل: a rising sun.
  '0004/2026': svg(
    '<circle cx="32" cy="32" r="30" fill="#FFF1E6"/>' +
      '<path d="M14 42a18 18 0 0 1 36 0Z" fill="#EA580C"/>' +
      '<g stroke="#EA580C" stroke-width="3" stroke-linecap="round"><path d="M32 12v6M18 18l4 4M46 18l-4 4M10 30h6M48 30h6"/></g>' +
      '<path d="M12 48h40" stroke="#9A3412" stroke-width="3" stroke-linecap="round"/>',
  ),
  // جمعية بسمة: a child's smile in a soft circle.
  '0005/2026': svg(
    '<circle cx="32" cy="32" r="30" fill="#F6E8F7"/>' +
      '<circle cx="32" cy="32" r="20" fill="#A21CAF"/>' +
      '<circle cx="25" cy="28" r="2.6" fill="#FFFFFF"/><circle cx="39" cy="28" r="2.6" fill="#FFFFFF"/>' +
      '<path d="M23 36c4 6 14 6 18 0" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round"/>',
  ),
  // جمعية الخير والبركة: a palm tree.
  '0006/2026': svg(
    '<rect x="2" y="2" width="60" height="60" rx="30" fill="#E7F5E8"/>' +
      '<path d="M31 54c1-10 1-20 1-28h2c0 8 0 18 1 28Z" fill="#7C4A1E"/>' +
      '<g fill="#15803D"><path d="M33 24c-6-8-14-8-20-4 7 0 13 2 20 4Z"/><path d="M33 24c6-8 14-8 20-4-7 0-13 2-20 4Z"/>' +
      '<path d="M33 24c-4-6-4-12 0-16 1 6 1 11 0 16Z"/><path d="M33 24c-8-2-14 2-16 10 5-5 10-8 16-10Z"/><path d="M33 24c8-2 14 2 16 10-5-5-10-8-16-10Z"/></g>',
  ),
};
