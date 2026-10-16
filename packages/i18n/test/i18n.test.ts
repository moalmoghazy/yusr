import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ar, createFormatters, createTranslator, dirOf, en, mergeMessages, negotiateLocale, type MessageTree } from '../src/index';

function leafKeys(tree: MessageTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' || (typeof value === 'object' && 'other' in value)) return [path];
    return leafKeys(value as MessageTree, path);
  });
}

const NBSP = '\u00A0';
/** ICU inserts bidi marks (e.g. U+061C after ٪); compare the visible text. */
const visible = (text: string) => text.replace(/[\u061C\u200E\u200F]/g, '');

describe('dictionaries', () => {
  it('have exactly the same keys in Arabic and English', () => {
    assert.deepEqual(leafKeys(en as MessageTree).sort(), leafKeys(ar as MessageTree).sort());
  });

  it('keep the same placeholders in both languages', () => {
    const placeholders = (value: unknown) => [...String(JSON.stringify(value)).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of leafKeys(ar as MessageTree)) {
      const get = (tree: unknown) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], tree);
      const arValue = get(ar);
      const enValue = get(en);
      const arSet = new Set(placeholders(arValue));
      const enSet = new Set(placeholders(enValue));
      arSet.delete('count');
      enSet.delete('count');
      assert.deepEqual([...enSet].sort(), [...arSet].sort(), `placeholder mismatch at ${key}`);
    }
  });
});

describe('Arabic plurals', () => {
  const { t } = createTranslator({ locale: 'ar', messages: ar });

  it('uses all six CLDR forms', () => {
    assert.equal(t('units.donors', { count: 0 }), 'لا متبرعين بعد');
    assert.equal(t('units.donors', { count: 1 }), 'متبرع واحد');
    assert.equal(t('units.donors', { count: 2 }), 'متبرعان');
    assert.equal(t('units.donors', { count: 7 }), '٧ متبرعين');
    assert.equal(t('units.donors', { count: 11 }), '١١ متبرعًا');
    assert.equal(t('units.donors', { count: 100 }), '١٠٠ متبرع');
    assert.equal(t('units.donors', { count: 103 }), '١٠٣ متبرعين');
    assert.equal(t('units.daysLeft', { count: 2 }), 'باقٍ يومان');
  });

  it('interpolates and localizes numbers', () => {
    const f = createFormatters('ar');
    assert.equal(visible(t('case.percentFunded', { percent: f.percent(76) })), '٧٦٪ مكتمل');
    assert.equal(t('landing.liveDonation', { name: 'منى', amount: f.money(100_00, 'EGP') }), `منى تبرّع بـ ١٠٠${NBSP}ج.م`);
  });

  it('returns the key and reports it when a message is missing', () => {
    const missing: string[] = [];
    const translator = createTranslator<string>({ locale: 'ar', messages: ar, onMissing: (key) => missing.push(key) });
    assert.equal(translator.t('nope.nothing'), 'nope.nothing');
    assert.deepEqual(missing, ['nope.nothing']);
  });
});

describe('English', () => {
  const { t } = createTranslator({ locale: 'en', messages: en });
  it('pluralizes one/other and zero overrides', () => {
    assert.equal(t('units.donors', { count: 1 }), '1 donor');
    assert.equal(t('units.donors', { count: 1250 }), '1,250 donors');
    assert.equal(t('units.donors', { count: 0 }), 'No donors yet');
  });
});

describe('formatters', () => {
  it('formats money the way each audience reads it', () => {
    const arabic = createFormatters('ar');
    const english = createFormatters('en');
    assert.equal(arabic.money(125_000, 'EGP'), `١٬٢٥٠${NBSP}ج.م`);
    assert.equal(arabic.money(9_425, 'EGP'), `٩٤٫٢٥${NBSP}ج.م`);
    assert.equal(english.money(125_000, 'EGP'), `EGP${NBSP}1,250`);
    assert.equal(english.money(2_500, 'USD'), '$25');
    assert.equal(english.money(1_840_000_000, 'EGP', { compact: true }), `EGP${NBSP}18.4M`);
    assert.match(arabic.money(1_840_000_000, 'EGP', { compact: true }), /مليون/);
  });

  it('can switch Arabic to Latin digits (admin tables)', () => {
    const latin = createFormatters('ar', { numberingSystem: 'latn' });
    assert.equal(latin.money(125_000, 'EGP'), `1,250${NBSP}ج.م`);
  });

  it('formats percentages, dates and relative time', () => {
    const arabic = createFormatters('ar');
    const english = createFormatters('en');
    assert.equal(visible(arabic.percent(76)), '٧٦٪');
    assert.equal(english.percent(76), '76%');
    assert.equal(english.date('2026-09-26T10:00:00Z'), 'September 26, 2026');
    const now = Date.parse('2026-09-26T12:00:00Z');
    assert.equal(english.relative('2026-09-26T11:55:00Z', now), '5 minutes ago');
    assert.match(arabic.relative('2026-09-26T11:55:00Z', now), /٥ دقائق/);
  });
});

describe('locales', () => {
  it('negotiates from Accept-Language and defaults to Arabic', () => {
    assert.equal(negotiateLocale('en-US,en;q=0.9,ar;q=0.8'), 'en');
    assert.equal(negotiateLocale('fr-FR,fr;q=0.9'), 'ar');
    assert.equal(negotiateLocale(['ar-EG', 'en-GB']), 'ar');
    assert.equal(negotiateLocale(null), 'ar');
  });

  it('knows the writing direction', () => {
    assert.equal(dirOf('ar'), 'rtl');
    assert.equal(dirOf('en'), 'ltr');
  });

  it('merges app namespaces into the shared dictionary', () => {
    const merged = mergeMessages(ar, { extra: { hello: 'مرحبًا' }, common: { brandNew: 'جديد' } });
    const { t } = createTranslator<string>({ locale: 'ar', messages: merged });
    assert.equal(t('extra.hello'), 'مرحبًا');
    assert.equal(t('common.brandNew'), 'جديد');
    assert.equal(t('common.donate'), 'تبرّع');
  });
});
