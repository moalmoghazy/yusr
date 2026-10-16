/**
 * iOS Universal Links: lets case links open in the Yusr app when it is installed.
 * Set APPLE_TEAM_ID (and APPLE_BUNDLE_ID if it differs) in production; without a team ID the
 * file is served empty, so nothing is claimed.
 */
export function GET() {
  const team = process.env['APPLE_TEAM_ID'];
  const bundle = process.env['APPLE_BUNDLE_ID'] ?? 'org.yusr.app';
  const details = team ? [{ appIDs: [`${team}.${bundle}`], components: [{ '/': '/ar/cases/*' }, { '/': '/en/cases/*' }] }] : [];
  return Response.json({ applinks: { details } }, { headers: { 'cache-control': 'public, max-age=3600' } });
}
