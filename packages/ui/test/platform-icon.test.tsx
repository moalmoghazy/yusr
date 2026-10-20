import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SHARE_PLATFORMS } from '@yusr/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLATFORM_GLYPHS, PlatformIcon } from '../src/index';

describe('PlatformIcon', () => {
  it('has a logo and a colour for every platform a case can be shared on', () => {
    for (const platform of SHARE_PLATFORMS) {
      assert.ok(PLATFORM_GLYPHS[platform].d.startsWith('M'), platform);
      assert.ok(PLATFORM_GLYPHS[platform].brand, platform);
    }
  });

  it('draws the logo in a decorative chip that takes the platform’s colour on hover', () => {
    const html = renderToStaticMarkup(<PlatformIcon platform="facebook" />);
    assert.match(html, /aria-hidden="true"/);
    assert.ok(html.includes('--platform-brand:#0866FF'));
    assert.ok(html.includes('group-hover:[background:var(--platform-brand)]'));
    assert.ok(html.includes(`d="${PLATFORM_GLYPHS.facebook.d}"`));
  });
});
