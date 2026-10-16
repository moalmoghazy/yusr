import { CASE_CATEGORIES, CASE_STATUSES } from '@yusr/core';
import { brand } from '@yusr/theme';
import { useMemo, useState, type ReactNode } from 'react';
import { useNow } from '../app/clock';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { CategoryBadge, CountdownChip, DonationProgress, StatusBadge, VerifiedBadge, ZakatBadge } from '../ui/case-ui';
import { DocSectionHead } from '../ui/page-nav';
import { Button, Checkbox, Chip, Input, Segmented, Switch } from '../ui/primitives';

const ARABIC_LETTERS = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي';
const WEIGHTS = [300, 400, 500, 600, 700] as const;

const LEDGER_SAMPLE = [
  'RCPT-004187 · TXN 7F3A9C2E',
  'DR asset:clearing:paymob   1,250.00',
  'DR expense:gateway_fees       37.50',
  'CR liability:case:0142     1,250.00',
  'CR revenue:fee_recovery       37.50',
].join('\n');

export function TypeSection({ index }: { index: string }) {
  const { t, f } = useT();
  const { theme } = usePrototype();
  const scale = Object.entries(theme.typography.scale).reverse();
  // The live heading face (it can be switched in the theming playground).
  const displayFamily = theme.typography.fonts.display.split(',')[0]!.replace(/["']/g, '').trim();
  return (
    <section id="brand-type" className="doc-section doc-section-tint">
      <div className="container">
        <DocSectionHead index={index} title={t('proto.brand.typography')} body={t('proto.brand.typographyBody')} />
        <div className="type-grid">
          <article className="type-card type-card-display">
            <header className="type-card-head">
              <span className="type-role">{t('proto.brand.display')}</span>
              <span className="type-family" dir="ltr">
                {displayFamily}
              </span>
            </header>
            <p className="specimen-xl" lang="ar" dir="rtl">
              {brand.tagline.ar}
            </p>
            <p className="specimen-lg" lang="en" dir="ltr">
              {brand.tagline.en}
            </p>
            <p className="specimen-glyphs" lang="ar" dir="rtl">
              {ARABIC_LETTERS}
            </p>
          </article>
          <article className="type-card">
            <header className="type-card-head">
              <span className="type-role">{t('proto.brand.text')}</span>
              <span className="type-family" dir="ltr">
                IBM Plex Sans Arabic
              </span>
            </header>
            <p className="specimen-body">{t('proto.brand.specimenBody')}</p>
            <div className="weights">
              {WEIGHTS.map((weight) => (
                <span key={weight} className="weight" style={{ fontWeight: weight }}>
                  <span className="weight-sample">{brand.name.ar} Yusr</span>
                  <span className="weight-num mono">{weight}</span>
                </span>
              ))}
            </div>
            <p className="specimen-digits">
              <span dir="rtl" lang="ar">
                ٠١٢٣٤٥٦٧٨٩
              </span>
              <span className="muted">·</span>
              <span dir="ltr">0123456789</span>
            </p>
          </article>
          <article className="type-card">
            <header className="type-card-head">
              <span className="type-role">{t('proto.brand.monoFace')}</span>
              <span className="type-family" dir="ltr">
                IBM Plex Mono
              </span>
            </header>
            <p className="specimen-mono" dir="ltr">
              YSR-2026-0142
            </p>
            <pre className="specimen-mono-sm" dir="ltr">
              {LEDGER_SAMPLE}
            </pre>
          </article>
        </div>

        <h3 className="doc-h3">{t('proto.brand.typeScale')}</h3>
        <div className="type-scale">
          {scale.map(([name, px]) => (
            <div key={name} className="type-row">
              <span className="type-row-token mono">{name}</span>
              <span className="type-row-px mono muted">{f.number(px)}px</span>
              <span className={px >= 25 ? 'type-row-sample is-display' : 'type-row-sample'} style={{ fontSize: px }}>
                {t('proto.brand.specimenDisplay')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ComponentsSection({ index }: { index: string }) {
  const { t, f } = useT();
  const now = useNow();
  // A deadline two days out, fixed at first render so the countdown ticks naturally.
  const deadline = useMemo(() => new Date(now + (2 * 24 + 5) * 3_600_000).toISOString(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [currency, setCurrency] = useState<'EGP' | 'SAR' | 'USD'>('EGP');
  const [anonymous, setAnonymous] = useState(true);
  const [coverFees, setCoverFees] = useState(true);
  const [chip, setChip] = useState<string>('medical');

  return (
    <section id="brand-components" className="doc-section">
      <div className="container">
        <DocSectionHead index={index} title={t('proto.brand.components')} />
        <div className="gallery">
          <Group title={t('proto.brand.componentGroups.buttons')}>
            <div className="gallery-row">
              <Button icon="heart">{t('common.donateNow')}</Button>
              <Button variant="gold" icon="receipt">
                {t('donate.viewReceipt')}
              </Button>
              <Button variant="secondary" icon="eye">
                {t('common.view')}
              </Button>
              <Button variant="soft" icon="share">
                {t('common.share')}
              </Button>
              <Button variant="outline">{t('common.learnMore')}</Button>
              <Button variant="ghost">{t('common.cancel')}</Button>
              <Button variant="danger" icon="x">
                {t('admin.cases.transitions.rejected')}
              </Button>
            </div>
            <div className="gallery-row">
              <Button size="sm">{t('common.donate')}</Button>
              <Button size="md">{t('common.donate')}</Button>
              <Button size="lg">{t('common.donate')}</Button>
              <Button loading>{t('common.loading')}</Button>
              <Button disabled>{t('common.donate')}</Button>
            </div>
          </Group>

          <Group title={t('proto.brand.componentGroups.badges')}>
            <div className="gallery-row">
              {CASE_STATUSES.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </div>
            <div className="gallery-row">
              <VerifiedBadge />
              <ZakatBadge />
              <CountdownChip deadline={deadline} />
              {CASE_CATEGORIES.map((category) => (
                <CategoryBadge key={category} category={category} />
              ))}
            </div>
          </Group>

          <Group title={t('proto.brand.componentGroups.controls')}>
            <div className="gallery-row">
              {CASE_CATEGORIES.slice(0, 4).map((category) => (
                <Chip key={category} selected={chip === category} onClick={() => setChip(category)}>
                  {t(`categories.${category}`)}
                </Chip>
              ))}
            </div>
            <div className="gallery-controls">
              <Segmented
                label={t('donate.currency')}
                value={currency}
                onChange={setCurrency}
                options={(['EGP', 'SAR', 'USD'] as const).map((code) => ({ value: code, label: f.currencyLabel(code) }))}
              />
              <Input icon="search" placeholder={t('common.search')} aria-label={t('common.search')} />
              <Switch checked={anonymous} onChange={setAnonymous} label={t('donate.anonymous')} />
              <Checkbox checked={coverFees} onChange={setCoverFees} label={t('donate.coverFees', { fee: f.money(3_750, 'EGP') })} />
            </div>
          </Group>

          <Group title={t('proto.brand.componentGroups.progress')}>
            <div className="gallery-progress">
              <DonationProgress raisedMinor={3_450_000} goalMinor={12_000_000} currency="EGP" donors={41} />
              <DonationProgress raisedMinor={19_990_000} goalMinor={20_000_000} currency="EGP" donors={312} />
              <DonationProgress raisedMinor={5_000_000} goalMinor={5_000_000} currency="EGP" donors={87} />
            </div>
            <p className="muted gallery-note">{t('proto.brand.progressNote')}</p>
          </Group>
        </div>
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gallery-group">
      <h3 className="gallery-title">{title}</h3>
      {children}
    </section>
  );
}
