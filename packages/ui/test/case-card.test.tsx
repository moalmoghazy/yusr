import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CaseSummary } from '@yusr/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaseCard, CountdownBadge, DonationProgress, cn, textFor, type CardLinkProps } from '../src/index';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const HOUR = 3_600_000;

function fixture(overrides: Partial<CaseSummary> = {}): CaseSummary {
  return {
    id: 'c-1',
    slug: 'open-heart-surgery-cairo',
    reference: 'YSR-10482',
    category: 'medical',
    status: 'published',
    title: { ar: 'عملية قلب مفتوح لطفلة عمرها ٦ سنوات', en: 'Open-heart surgery for a 6-year-old' },
    summary: { ar: 'موعد العملية محدد في معهد القلب.', en: 'The surgery is booked at the National Heart Institute.' },
    shareText: null,
    region: 'EG-C',
    currency: 'EGP',
    goalMinor: 250_000_00,
    platformFeeMinor: 0,
    raisedMinor: 97_481_00,
    donorsCount: 214,
    isUrgent: true,
    deadline: new Date(NOW + 6 * HOUR).toISOString(),
    zakatEligible: true,
    verifiedAt: '2026-09-20T09:00:00Z',
    publishedAt: '2026-09-21T09:00:00Z',
    fundedAt: null,
    priority: 5,
    coverSeed: 7,
    createdAt: '2026-09-18T09:00:00Z',
    ...overrides,
  };
}

/** Every <a …> in the markup, with its attributes. */
function links(html: string): Array<Record<string, string>> {
  return [...html.matchAll(/<a\s([^>]*)>/g)].map((match) =>
    Object.fromEntries([...match[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1]!, attr[2]!.replace(/&amp;/g, '&')])),
  );
}

const HREF = '/ar/cases/open-heart-surgery-cairo';

describe('CaseCard', () => {
  it('renders an open case: title link, trust signals, progress and three quick amounts', () => {
    const html = renderToStaticMarkup(<CaseCard item={fixture()} locale="ar" href={HREF} now={NOW} />);
    const { f } = textFor('ar');

    // The article is named by its title, and the title links to the case.
    const labelledBy = /<article aria-labelledby="([^"]+)"/.exec(html)?.[1];
    assert.ok(labelledBy, 'article has aria-labelledby');
    assert.match(html, new RegExp(`<h3 id="${labelledBy}"`));
    assert.ok(html.includes('عملية قلب مفتوح لطفلة عمرها ٦ سنوات'));
    assert.ok(html.includes('القاهرة'), 'region name');
    assert.ok(html.includes('dir="ltr">YSR-10482</span>'), 'reference kept left-to-right');
    assert.ok(html.includes('aria-label="حالة موثّقة ميدانيًا"'), 'verified shield is announced');

    // Honest progress: 97,481 of 250,000 → 38%.
    assert.ok(html.includes('role="progressbar"'));
    assert.ok(html.includes('aria-valuenow="38"'));
    assert.ok(html.includes(`aria-label="تم جمع ${f.percent(38)} من الهدف"`));
    assert.ok(html.includes('style="width:38%"'));

    // Quick amounts deep-link into checkout with the amount preset, in minor units.
    const all = links(html);
    const quick = all.filter((link) => link['href']?.includes('?amount='));
    assert.deepEqual(
      quick.map((link) => link['href']),
      [`${HREF}?amount=5000#donate`, `${HREF}?amount=10000#donate`, `${HREF}?amount=25000#donate`],
    );
    assert.equal(quick[0]!['aria-label'], `تبرّع بـ ${f.money(5000, 'EGP', { fractionDigits: 0 })}`);
    assert.ok(
      all.some((link) => link['href'] === `${HREF}#donate`),
      'donate button',
    );
    assert.ok(
      all.some((link) => link['href'] === HREF),
      'stretched title link',
    );
    assert.ok(!html.includes('#transparency'));

    // Urgent, 6 hours left → the live countdown switches to hh:mm:ss.
    assert.ok(html.includes('role="timer"'));
    assert.ok(html.includes('٠٦:٠٠:٠٠'), 'countdown shows 06:00:00');
  });

  it('swaps the donate row for the transparency link once a case is funded', () => {
    const item = fixture({ status: 'funded', raisedMinor: 250_000_00, fundedAt: '2026-09-27T10:00:00Z' });
    const html = renderToStaticMarkup(<CaseCard item={item} locale="ar" href={HREF} now={NOW} />);
    const all = links(html);
    assert.ok(all.some((link) => link['href'] === `${HREF}#transparency`));
    assert.ok(!all.some((link) => link['href']?.includes('#donate')));
    assert.ok(html.includes('أين تذهب التبرعات'));
    assert.ok(html.includes('اكتمل التمويل'));
    assert.ok(html.includes('aria-valuenow="100"'));
    assert.ok(!html.includes('role="timer"'), 'no countdown on a funded case');
  });

  it('speaks English and uses the app’s link component and checkout route', () => {
    const seen: string[] = [];
    function RouterLink(props: CardLinkProps) {
      seen.push(props.href);
      return <a data-router="" {...props} />;
    }
    const html = renderToStaticMarkup(
      <CaseCard
        item={fixture({ isUrgent: false, deadline: null, currency: 'SAR' })}
        locale="en"
        href="/en/cases/open-heart-surgery-cairo"
        donateHref={(amountMinor) => `/en/donate/c-1${amountMinor ? `?amount=${amountMinor}` : ''}`}
        link={RouterLink}
      />,
    );
    const { f } = textFor('en');
    assert.ok(html.includes('Open-heart surgery for a 6-year-old'));
    assert.ok(html.includes('Cairo'));
    assert.deepEqual(seen, [
      '/en/cases/open-heart-surgery-cairo',
      '/en/donate/c-1?amount=1000',
      '/en/donate/c-1?amount=5000',
      '/en/donate/c-1?amount=10000',
      '/en/donate/c-1',
    ]);
    assert.ok(html.includes(`aria-label="Give ${f.money(1000, 'SAR', { fractionDigits: 0 })}"`));
    assert.ok(!html.includes('role="timer"'));
  });

  it('gives two cards of the same case distinct title ids', () => {
    const html = renderToStaticMarkup(
      <>
        <CaseCard item={fixture()} locale="ar" href={HREF} now={NOW} />
        <CaseCard item={fixture()} locale="ar" href={HREF} now={NOW} />
      </>,
    );
    const ids = [...html.matchAll(/<h3 id="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    const patterns = [...html.matchAll(/<pattern id="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(patterns).size, 2, 'each cover has its own lattice pattern');
  });

  it('puts every cover motif in the same place, without the golden dot, over a drifting lattice', () => {
    const motif = (coverSeed: number) => {
      const html = renderToStaticMarkup(<CaseCard item={{ ...fixture(), coverSeed }} locale="ar" href={HREF} now={NOW} />);
      assert.ok(!html.includes('fill-highlight'), 'no golden dot on the cover');
      assert.ok(html.includes('class="case-cover-drift"'));
      return html.match(/transform="(translate\([^"]+scale\([^"]+)"/)?.[1];
    };
    assert.ok(motif(1));
    assert.equal(motif(1), motif(2));
    assert.equal(motif(2), motif(7));
  });
});

describe('DonationProgress', () => {
  it('never reads 0% once someone has given', () => {
    const html = renderToStaticMarkup(<DonationProgress raisedMinor={100} goalMinor={1_000_000_00} currency="EGP" locale="ar" />);
    assert.ok(html.includes('aria-valuenow="1"'));
    assert.ok(html.includes('style="width:1.5%"'), 'a first donation is visible');
  });

  it('renders the bar alone when amounts are hidden', () => {
    const html = renderToStaticMarkup(<DonationProgress raisedMinor={0} goalMinor={100_00} currency="USD" locale="en" showAmounts={false} />);
    assert.ok(html.includes('aria-valuenow="0"'));
    assert.ok(!html.includes('remaining') && !html.includes('Remaining'));
  });
});

describe('CountdownBadge', () => {
  it('counts days while more than a day remains', () => {
    const html = renderToStaticMarkup(<CountdownBadge deadline={new Date(NOW + 3 * 24 * HOUR + HOUR).toISOString()} locale="ar" initialNow={NOW} />);
    assert.ok(html.includes('باقٍ ٣ أيام'));
  });

  it('says the deadline passed, and renders nothing without one', () => {
    assert.ok(renderToStaticMarkup(<CountdownBadge deadline={new Date(NOW - HOUR).toISOString()} locale="ar" initialNow={NOW} />).includes('انتهت المهلة'));
    assert.equal(renderToStaticMarkup(<CountdownBadge deadline={null} locale="ar" initialNow={NOW} />), '');
  });
});

describe('cn', () => {
  it('lets later Tailwind classes win, including the theme’s named radii and easings', () => {
    assert.equal(cn('rounded-card px-2', 'rounded-full px-4'), 'rounded-full px-4');
    assert.equal(cn('ease-standard', 'ease-emphasized'), 'ease-emphasized');
    assert.equal(cn('bg-tone-rose-soft text-xs', false, 'bg-card'), 'text-xs bg-card');
  });
});

describe('Logo', () => {
  it('names itself and draws the two dots at full size, one stroke when tiny', async () => {
    const { LogoMark } = await import('../src/index');
    const full = renderToStaticMarkup(<LogoMark size={40} title="شعار يُسر" />);
    assert.ok(full.includes('aria-label="شعار يُسر"'));
    assert.equal((full.match(/<circle /g) ?? []).length, 2);
    const tiny = renderToStaticMarkup(<LogoMark size={16} />);
    assert.equal((tiny.match(/<circle /g) ?? []).length, 0);
    assert.ok(tiny.includes('<line '));
  });

  it('can set the Arabic name in the logo face, and always sets the English one there', async () => {
    const { Logo } = await import('../src/index');
    const ar = renderToStaticMarkup(<Logo locale="ar" size={32} wordmark="typeset" />);
    assert.ok(ar.includes('aria-label="شعار يُسر"') && ar.includes('role="img"'));
    assert.ok(ar.includes('>يُسر</span>') && ar.includes('font-logo'), 'the logo face, not the heading face');
    assert.equal((ar.match(/<circle /g) ?? []).length, 2, 'the mark’s two dots');
    const en = renderToStaticMarkup(<Logo locale="en" size={32} />);
    assert.ok(en.includes('>Yusr</span>') && en.includes('font-logo'));
  });

  it('letters «يُسر» in Kufi beside the mark by default', async () => {
    const { Logo } = await import('../src/index');
    const { lockup, wordmark } = await import('@yusr/theme');
    const ar = renderToStaticMarkup(<Logo locale="ar" size={32} />);
    assert.ok(ar.includes(`d="${wordmark.stroke.d}"`) && ar.includes('stroke-linecap="round"'), 'the word is drawn, with round ends');
    assert.ok(ar.includes(`translate(${lockup.markX} 0)`), 'the mark shares the word’s grid');
    assert.equal((ar.match(/<circle /g) ?? []).length, 4, 'two dots in the word, two in the mark');
    assert.ok(!ar.includes('يُسر<'), 'no text: the word is drawn');
  });
});
