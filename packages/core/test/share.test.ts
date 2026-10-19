import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SHARE_PLATFORMS, shareUrl } from '../src';

const url = 'https://yusr.example/ar/cases/heart-surgery?x=1&y=2';
const text = 'ساهم معي في حالة «عملية قلب» على يُسر';

describe('sharing a case', () => {
  it('opens each platform’s own share address with the link encoded', () => {
    for (const platform of SHARE_PLATFORMS) {
      const address = shareUrl(platform, url, text);
      if (platform === 'instagram') {
        assert.equal(address, null, 'Instagram has no web share address');
        continue;
      }
      assert.ok(address !== null && address.startsWith('https://'), platform);
      assert.ok(!address.includes(url), `${platform}: the link is encoded, so its own ? and & stay inside it`);
      const parsed = new URL(address);
      const values = [...parsed.searchParams.values()].join('\n');
      assert.ok(values.includes(url), `${platform}: the link arrives intact`);
    }
  });

  it('carries the message where the platform takes one', () => {
    assert.equal(new URL(shareUrl('whatsapp', url, text)!).searchParams.get('text'), `${text}\n${url}`);
    assert.equal(new URL(shareUrl('telegram', url, text)!).searchParams.get('text'), text);
    assert.equal(new URL(shareUrl('reddit', url, text)!).searchParams.get('title'), text);
    assert.equal(new URL(shareUrl('facebook', url, text)!).searchParams.get('u'), url);
    assert.equal(new URL(shareUrl('snapchat', url, text)!).searchParams.get('link'), url);
  });
});
