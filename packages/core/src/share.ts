/**
 * Sharing a case on social platforms. Each platform's own "share" address is used (no SDKs, no
 * tracking scripts): the person lands in the platform with the link — and, where it allows, a short
 * message — ready to post. Instagram offers no such address for websites, so it has none here:
 * the website hands it to the phone's share sheet, or copies the link.
 */
export const SHARE_PLATFORMS = ['whatsapp', 'facebook', 'instagram', 'telegram', 'snapchat', 'reddit'] as const;
export type SharePlatform = (typeof SHARE_PLATFORMS)[number];

/**
 * The address that opens `platform` with `url` (absolute) and `text` ready to share, or null for a
 * platform with no web share address (Instagram).
 */
export function shareUrl(platform: SharePlatform, url: string, text: string): string | null {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  switch (platform) {
    case 'whatsapp':
      // WhatsApp shares one text field: the message, then the link on its own line.
      return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
    case 'facebook':
      // Facebook reads the title, description and image from the page itself (Open Graph).
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case 'telegram':
      return `https://t.me/share/url?url=${u}&text=${t}`;
    case 'snapchat':
      return `https://www.snapchat.com/share?link=${u}`;
    case 'reddit':
      return `https://www.reddit.com/submit?url=${u}&title=${t}`;
    case 'instagram':
      return null;
  }
}
