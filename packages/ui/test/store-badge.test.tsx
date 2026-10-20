import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { STORE_GLYPHS, StoreBadge } from '../src/index';

describe('StoreBadge', () => {
  it('has a logo for App Store, Google Play and AppGallery', () => {
    assert.deepEqual(Object.keys(STORE_GLYPHS), ['appStore', 'googlePlay', 'appGallery']);
  });

  it('links to the store page, and turns into the store’s own black badge on hover', () => {
    const html = renderToStaticMarkup(
      <StoreBadge store="googlePlay" name="Google Play" caption="حمّله من" href="https://play.google.com/store/apps/details?id=x" />,
    );
    assert.match(html, /^<a href="https:\/\/play\.google\.com/);
    assert.ok(html.includes('aria-label="حمّله من Google Play"'));
    assert.ok(html.includes('hover:bg-black'));
    assert.ok(html.includes('fill="url(#yusr-google-play)"'), 'the real colours, shown on hover');
  });

  it('is shown but not a link until the app is in that store', () => {
    const html = renderToStaticMarkup(<StoreBadge store="appStore" name="App Store" caption="قريبًا على" />);
    assert.match(html, /^<span /);
    assert.ok(!html.includes('href='));
  });
});
