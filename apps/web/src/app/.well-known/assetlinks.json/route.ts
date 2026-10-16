/**
 * Android App Links (verified intent filters in apps/mobile/app.json): proves the app may open
 * yusr.org case links. ANDROID_CERT_SHA256 is the signing certificate's fingerprint(s), comma-separated.
 */
export function GET() {
  const fingerprints = (process.env['ANDROID_CERT_SHA256'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const statements = fingerprints.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: process.env['ANDROID_PACKAGE'] ?? 'org.yusr.app', sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];
  return Response.json(statements, { headers: { 'cache-control': 'public, max-age=3600' } });
}
