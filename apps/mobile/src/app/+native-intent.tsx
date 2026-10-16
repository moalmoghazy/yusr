/**
 * Website links opened on a phone with the app installed (Android App Links / iOS Universal
 * Links for https://yusr.org/ar/cases/<slug>) land on the matching screen. Plain string matching:
 * React Native's URL implementation doesn't provide every getter.
 */
const WEB_CASE = /^(?:https?:\/\/[^/]+)?\/(?:ar|en)\/cases\/([^/?#]+)/;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const match = WEB_CASE.exec(path);
  return match ? `/case/${match[1]}` : path;
}
