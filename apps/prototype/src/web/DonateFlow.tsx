import { CURRENCY_META, groupDigits, type CaseSummary, type CreateDonationResponse, type Currency, type LedgerLine } from '@yusr/core';
import { useState, type ReactNode } from 'react';
import { backend, useRead } from '../app/backend';
import { useL, useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { Icon } from '../ui/icons';
import { Button, Checkbox, Chip, CopyButton, Dialog, Field, Input, Segmented, Switch, cx, useToast } from '../ui/primitives';
import { useDonationDraft, errorCode, METHOD_ICON, type DonationDraft } from './donation';

type Step = 'amount' | 'details' | 'method' | 'gateway' | 'done' | 'failed' | 'pending';

export function DonateDialog({ item, presetMinor, onClose }: { item: CaseSummary; presetMinor?: number; onClose: () => void }) {
  const { t, f } = useT();
  const l = useL();
  const { locale } = usePrototype();
  const draft = useDonationDraft(item, { presetMinor, channel: 'web', locale });
  const [step, setStep] = useState<Step>('amount');
  const [response, setResponse] = useState<CreateDonationResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const toast = useToast();

  const stepIndex = { amount: 1, details: 2, method: 3, gateway: 3, done: 4, failed: 4, pending: 4 }[step];

  const pay = () => {
    try {
      setSubmitError(null);
      const created = draft.submit();
      setResponse(created);
      setStep('gateway');
    } catch (error) {
      setSubmitError(t(`errors.${errorCode(error)}` as 'errors.generic'));
    }
  };

  const finish = (outcome: 'success' | 'failure' | 'pending') => {
    if (outcome === 'success') {
      setStep('done');
      toast({ title: t('proto.toasts.yourDonation'), tone: 'success', icon: 'check' });
    } else if (outcome === 'failure') setStep('failed');
    else setStep('pending');
  };

  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      size="md"
      title={t('donate.title')}
      description={l(item.title)}
      footer={
        step === 'amount' || step === 'details' || step === 'method' ? (
          <div className="flow-footer">
            {step !== 'amount' ? (
              <Button variant="ghost" icon="back" onClick={() => setStep(step === 'method' ? 'details' : 'amount')}>
                {t('common.back')}
              </Button>
            ) : (
              <span />
            )}
            {step === 'method' ? (
              <Button size="lg" icon="lock" onClick={pay} disabled={!draft.canContinue}>
                {t('donate.pay', { amount: draft.breakdown ? f.money(draft.breakdown.chargedMinor, draft.currency) : '' })}
              </Button>
            ) : (
              <Button size="lg" iconEnd="forward" disabled={!draft.canContinue} onClick={() => setStep(step === 'amount' ? 'details' : 'method')}>
                {t('common.next')}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <FlowSteps current={stepIndex} />
      {step === 'amount' && <AmountStep draft={draft} zakatEligible={item.zakatEligible} />}
      {step === 'details' && <DetailsStep draft={draft} />}
      {step === 'method' && (
        <>
          <MethodStep draft={draft} />
          {submitError && (
            <p className="field-error" role="alert">
              <Icon name="alert" size={14} /> {submitError}
            </p>
          )}
        </>
      )}
      {step === 'gateway' && response && <GatewayStep response={response} draft={draft} onFinish={finish} onClose={onClose} />}
      {step === 'done' && response && <SuccessStep response={response} caseItem={item} onClose={onClose} />}
      {step === 'failed' && (
        <div className="result result-failed">
          <span className="result-icon">
            <Icon name="x" size={30} />
          </span>
          <h3>{t('donate.failedTitle')}</h3>
          <p>{t('donate.failedBody')}</p>
          <Button icon="refresh" onClick={() => setStep('method')}>
            {t('common.retry')}
          </Button>
        </div>
      )}
      {step === 'pending' && response && <PendingStep response={response} onClose={onClose} />}
    </Dialog>
  );
}

function FlowSteps({ current }: { current: number }) {
  const { t, f } = useT();
  const steps = [t('donate.steps.amount'), t('donate.steps.details'), t('donate.steps.payment'), t('donate.steps.done')];
  return (
    <ol className="flow-steps" aria-label={t('proto.web.stepOf', { step: current, total: steps.length })}>
      {steps.map((label, index) => (
        <li
          key={label}
          className={cx(index + 1 < current && 'is-done', index + 1 === current && 'is-current')}
          aria-current={index + 1 === current ? 'step' : undefined}
        >
          <span className="flow-step-dot">{index + 1 < current ? <Icon name="check" size={13} strokeWidth={2.6} /> : f.number(index + 1)}</span>
          <span className="flow-step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function AmountStep({ draft, zakatEligible }: { draft: DonationDraft; zakatEligible: boolean }) {
  const { t, f } = useT();
  const currencies: Currency[] = ['EGP', 'SAR', 'USD'];
  return (
    <div className="flow-section">
      <div className="flow-row">
        <h3 className="flow-heading">{t('donate.chooseAmount')}</h3>
        <Segmented
          size="sm"
          label={t('donate.currency')}
          value={draft.currency}
          onChange={draft.setCurrency}
          options={currencies.map((code) => ({ value: code, label: f.currencyLabel(code), ariaLabel: t(`currency.${code}`) }))}
        />
      </div>
      <div className="amount-grid">
        {draft.meta.quickAmounts.map((amount) => {
          const selected = draft.amountMinor === amount * 100;
          return (
            <button
              key={amount}
              type="button"
              className={cx('amount-tile', selected && 'is-selected')}
              aria-pressed={selected}
              onClick={() => draft.setAmountInput(f.number(amount, { useGrouping: false }))}
            >
              <strong>{f.number(amount)}</strong>
              <small>{f.currencyLabel(draft.currency)}</small>
            </button>
          );
        })}
      </div>
      <Field
        label={t('donate.customAmount')}
        htmlFor="donation-amount"
        hint={t('donate.minAmount', { amount: f.money(draft.meta.minDonationMinor, draft.currency) })}
        error={draft.amountError ? t(`errors.${draft.amountError}`) : undefined}
      >
        <span className="amount-input">
          <input
            id="donation-amount"
            className="input input-lg"
            inputMode="decimal"
            autoComplete="off"
            value={draft.amountInput}
            onChange={(event) => draft.setAmountInput(event.target.value)}
            aria-describedby="donation-amount-currency"
          />
          <span id="donation-amount-currency" className="amount-suffix">
            {f.currencyLabel(draft.currency)}
          </span>
        </span>
      </Field>
      <div className="flow-row flow-row-wrap">
        <span className="flow-label">{t('donate.type')}</span>
        <div className="chip-row">
          {(['zakat', 'sadaqah', 'general'] as const).map((type) => (
            <Chip
              key={type}
              selected={draft.type === type}
              onClick={() => (zakatEligible || type !== 'zakat' ? draft.setType(type) : undefined)}
              className={type === 'zakat' && !zakatEligible ? 'is-disabled' : undefined}
            >
              {t(`donationType.${type}`)}
            </Chip>
          ))}
        </div>
      </div>
      {!zakatEligible && <p className="flow-note">{t('donate.zakatUnavailable')}</p>}
      <Checkbox checked={draft.coverFees} onChange={draft.setCoverFees} label={t('donate.coverFees', { fee: f.money(draft.coverPreview, draft.currency) })} />
      <Summary draft={draft} />
    </div>
  );
}

export function Summary({ draft }: { draft: DonationDraft }) {
  const { t, f } = useT();
  const b = draft.breakdown;
  if (!b) return null;
  return (
    <dl className="summary">
      <div>
        <dt>{t('donate.summary.amount')}</dt>
        <dd>{f.money(b.amountMinor, b.currency)}</dd>
      </div>
      {b.donorCoveredFeeMinor > 0 && (
        <div>
          <dt>{t('donate.summary.covered')}</dt>
          <dd>{f.money(b.donorCoveredFeeMinor, b.currency)}</dd>
        </div>
      )}
      <div className="summary-muted">
        <dt>{t('donate.summary.fee')}</dt>
        <dd>{f.money(b.estimatedFeeMinor, b.currency)}</dd>
      </div>
      <div className="summary-total">
        <dt>{t('donate.summary.total')}</dt>
        <dd>{f.money(b.chargedMinor, b.currency)}</dd>
      </div>
      <div className="summary-case">
        <dt>
          <Icon name="heart" size={15} /> {t('donate.summary.caseReceives')}
        </dt>
        <dd>
          {f.money(b.netToCaseMinor, b.caseCurrency)}
          {b.currency !== b.caseCurrency && (
            <small className="summary-fx">{t('donate.summary.fx', { rate: f.number(b.fxRate, { maximumFractionDigits: 2 }) })}</small>
          )}
        </dd>
      </div>
    </dl>
  );
}

function DetailsStep({ draft }: { draft: DonationDraft }) {
  const { t } = useT();
  const l = useL();
  const { currentDonor } = backend;
  return (
    <div className="flow-section">
      <div className="account-card">
        {draft.guest ? (
          <>
            <h3 className="flow-heading">{t('donate.guestTitle')}</h3>
            <p className="flow-note">{t('donate.guestHint')}</p>
            <div className="form-grid">
              <Field label={t('donate.name')} htmlFor="guest-name" optionalLabel={t('common.optional')}>
                <Input id="guest-name" value={draft.guestName} onChange={(event) => draft.setGuestName(event.target.value)} autoComplete="name" />
              </Field>
              <Field label={`${t('donate.phone')} / ${t('donate.email')}`} htmlFor="guest-contact" optionalLabel={t('common.optional')}>
                <Input
                  id="guest-contact"
                  dir="ltr"
                  value={draft.guestContact}
                  onChange={(event) => draft.setGuestContact(event.target.value)}
                  placeholder="+20 100 000 0000"
                />
              </Field>
            </div>
            <button type="button" className="link-btn" onClick={() => draft.setGuest(false)}>
              {t('proto.web.useAccount')}
            </button>
          </>
        ) : (
          <div className="signed-in">
            <span className="avatar avatar-2" aria-hidden>
              {l(currentDonor.name)?.[0]}
            </span>
            <div>
              <strong>{t('proto.web.signedInAs', { name: l(currentDonor.name) ?? '' })}</strong>
              <small dir="ltr">{currentDonor.email}</small>
            </div>
            <button type="button" className="link-btn" onClick={() => draft.setGuest(true)}>
              {t('proto.web.giveAsGuest')}
            </button>
          </div>
        )}
      </div>
      <Switch checked={draft.anonymous} onChange={draft.setAnonymous} label={t('donate.anonymous')} description={t('donate.anonymousHint')} />
      <Field label={t('donate.dedication')} htmlFor="dedication" optionalLabel={t('common.optional')} hint={`${draft.dedication.length} / 140`}>
        <Input
          id="dedication"
          maxLength={140}
          value={draft.dedication}
          placeholder={t('donate.dedicationPlaceholder')}
          onChange={(event) => draft.setDedication(event.target.value)}
        />
      </Field>
    </div>
  );
}

export function MethodStep({ draft, compact = false }: { draft: DonationDraft; compact?: boolean }) {
  const { t } = useT();
  return (
    <div className="flow-section">
      <h3 className="flow-heading">{t('donate.method')}</h3>
      <div className={cx('method-grid', compact && 'method-grid-compact')} role="radiogroup" aria-label={t('donate.method')}>
        {draft.methods.map((method) => {
          const selected = draft.method === method;
          return (
            <button
              key={method}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cx('method-tile', selected && 'is-selected', `method-${method}`)}
              onClick={() => draft.setMethod(method)}
            >
              <span className="method-icon">
                <Icon name={METHOD_ICON[method]} size={20} />
              </span>
              <span className="method-text">
                <strong>{t(`payment.methods.${method}`)}</strong>
                {!compact && <small>{t(`payment.methodHints.${method}`)}</small>}
              </span>
              <span className="method-check" aria-hidden>
                <Icon name="check" size={14} strokeWidth={2.6} />
              </span>
            </button>
          );
        })}
      </div>
      <Summary draft={draft} />
      <p className="secure-note">
        <Icon name="lock" size={14} /> {t('donate.secureNote')}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Gateways (simulated)

export function GatewayStep({
  response,
  draft,
  onFinish,
  onClose,
}: {
  response: CreateDonationResponse;
  draft: DonationDraft;
  onFinish: (outcome: 'success' | 'failure' | 'pending') => void;
  onClose: () => void;
}) {
  const method = draft.method;
  if (method === 'apple_pay') return <ApplePaySheet response={response} onFinish={onFinish} />;
  if (response.action.type === 'fawry_reference') return <FawryPanel response={response} onFinish={onFinish} />;
  if (response.action.type === 'bank_transfer') return <InstaPayPanel response={response} onFinish={onFinish} onClose={onClose} />;
  if (method === 'vodafone_cash') return <WalletGateway response={response} onFinish={onFinish} />;
  return <CardGateway response={response} onFinish={onFinish} />;
}

function useSettle(response: CreateDonationResponse, onFinish: (outcome: 'success' | 'failure') => void) {
  const [phase, setPhase] = useState<'idle' | 'processing' | 'webhook'>('idle');
  const run = (outcome: 'success' | 'failure') => {
    setPhase('processing');
    setTimeout(() => {
      backend.completePayment(response.donationId, outcome);
      if (outcome === 'failure') {
        onFinish('failure');
        return;
      }
      setPhase('webhook');
      setTimeout(() => onFinish('success'), 900);
    }, 1_300);
  };
  return { phase, run };
}

function Processing({ phase }: { phase: 'processing' | 'webhook' }) {
  const { t } = useT();
  return (
    <div className="processing" role="status" aria-live="polite">
      <span className={cx('processing-ring', phase === 'webhook' && 'is-done')}>
        {phase === 'webhook' ? <Icon name="check" size={26} strokeWidth={2.4} /> : null}
      </span>
      <p>{phase === 'processing' ? t('proto.web.processingGateway') : t('proto.web.webhook')}</p>
    </div>
  );
}

function GatewayFrame({ provider, children }: { provider: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="gateway">
      <div className="gateway-bar">
        <Icon name="lock" size={14} />
        <span dir="ltr">checkout.{provider.toLowerCase()}.demo</span>
        <span className="gateway-tag">{t('donate.simulatedGateway')}</span>
      </div>
      <div className="gateway-body">{children}</div>
    </div>
  );
}

function CardGateway({ response, onFinish }: { response: CreateDonationResponse; onFinish: (outcome: 'success' | 'failure') => void }) {
  const { t, f } = useT();
  const { phase, run } = useSettle(response, onFinish);
  const provider = t(`payment.providers.${response.breakdown.provider}`);
  const mada = response.breakdown.currency === 'SAR';
  if (phase !== 'idle') return <Processing phase={phase} />;
  return (
    <GatewayFrame provider={provider}>
      <div className="gateway-amount">
        <span>{provider}</span>
        <strong>{f.money(response.breakdown.chargedMinor, response.breakdown.currency)}</strong>
      </div>
      <div className="form-grid">
        <Field label={t('donate.cardNumber')} htmlFor="card-number">
          <Input id="card-number" dir="ltr" defaultValue={mada ? '4464 0400 0000 0007' : '4242 4242 4242 4242'} icon="credit-card" inputMode="numeric" />
        </Field>
        <div className="form-row-2">
          <Field label={t('donate.expiry')} htmlFor="card-expiry">
            <Input id="card-expiry" dir="ltr" defaultValue="12 / 29" />
          </Field>
          <Field label={t('donate.cvc')} htmlFor="card-cvc">
            <Input id="card-cvc" dir="ltr" defaultValue="123" inputMode="numeric" />
          </Field>
        </div>
      </div>
      <Button size="lg" block icon="lock" onClick={() => run('success')} data-autofocus>
        {t('proto.web.cardPay')}
      </Button>
      <button type="button" className="link-btn link-muted" onClick={() => run('failure')}>
        {t('proto.web.simulateFailure')}
      </button>
    </GatewayFrame>
  );
}

function WalletGateway({ response, onFinish }: { response: CreateDonationResponse; onFinish: (outcome: 'success' | 'failure') => void }) {
  const { t, f } = useT();
  const { phase, run } = useSettle(response, onFinish);
  const [sent, setSent] = useState(false);
  if (phase !== 'idle') return <Processing phase={phase} />;
  return (
    <GatewayFrame provider="Paymob">
      <div className="gateway-amount">
        <span>{t('payment.methods.vodafone_cash')}</span>
        <strong>{f.money(response.breakdown.chargedMinor, response.breakdown.currency)}</strong>
      </div>
      <Field label={t('donate.walletNumber')} htmlFor="wallet-number">
        <Input id="wallet-number" dir="ltr" defaultValue="010 1234 5678" icon="smartphone" inputMode="tel" />
      </Field>
      {sent && (
        <Field label={t('donate.walletOtp')} htmlFor="wallet-otp">
          <Input id="wallet-otp" dir="ltr" defaultValue="482913" inputMode="numeric" className="otp-input" data-autofocus />
        </Field>
      )}
      {sent ? (
        <Button size="lg" block icon="check" onClick={() => run('success')}>
          {t('proto.web.walletConfirm')}
        </Button>
      ) : (
        <Button size="lg" block icon="send" onClick={() => setSent(true)} data-autofocus>
          {t('proto.web.walletSend')}
        </Button>
      )}
    </GatewayFrame>
  );
}

function ApplePaySheet({ response, onFinish }: { response: CreateDonationResponse; onFinish: (outcome: 'success' | 'failure') => void }) {
  const { t, f } = useT();
  const { phase, run } = useSettle(response, onFinish);
  if (phase !== 'idle') return <Processing phase={phase} />;
  return (
    <div className="apple-sheet" dir="ltr">
      <div className="apple-sheet-head">
        <strong>Apple Pay</strong>
        <span>{t('donate.applePaySheet')}</span>
      </div>
      <div className="apple-row">
        <Icon name="credit-card" size={20} />
        <span>Visa •••• 4242</span>
      </div>
      <div className="apple-row apple-total">
        <span>Yusr Foundation</span>
        <strong>{f.money(response.breakdown.chargedMinor, response.breakdown.currency)}</strong>
      </div>
      <button type="button" className="apple-confirm" onClick={() => run('success')} data-autofocus>
        <Icon name="scan-face" size={30} />
        <span>{t('donate.confirmWithFaceId')}</span>
      </button>
    </div>
  );
}

function FawryPanel({ response, onFinish }: { response: CreateDonationResponse; onFinish: (outcome: 'success' | 'failure' | 'pending') => void }) {
  const { t, f } = useT();
  const { phase, run } = useSettle(response, onFinish);
  if (response.action.type !== 'fawry_reference') return null;
  if (phase !== 'idle') return <Processing phase={phase} />;
  const reference = groupDigits(response.action.referenceNumber);
  return (
    <div className="async-pay">
      <span className="async-icon">
        <Icon name="store" size={24} />
      </span>
      <h3>{t('donate.fawryTitle')}</h3>
      <p>{t('donate.fawryBody')}</p>
      <div className="reference-box">
        <small>{t('donate.fawryReference')}</small>
        <CopyButton value={reference} label={t('common.copy')} copiedLabel={t('common.copied')} />
        <small>{t('donate.expiresAt', { date: f.dateTime(response.action.expiresAt) })}</small>
      </div>
      <div className="async-amount">
        <span>{t('donate.summary.total')}</span>
        <strong>{f.money(response.breakdown.chargedMinor, response.breakdown.currency)}</strong>
      </div>
      <div className="async-actions">
        <Button icon="store" onClick={() => run('success')}>
          {t('proto.web.simulateOutlet')}
        </Button>
        <Button variant="ghost" onClick={() => onFinish('pending')}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

function InstaPayPanel({ response, onFinish, onClose }: { response: CreateDonationResponse; onFinish: (outcome: 'pending') => void; onClose: () => void }) {
  const { t, f } = useT();
  const { goAdmin } = usePrototype();
  if (response.action.type !== 'bank_transfer') return null;
  return (
    <div className="async-pay">
      <span className="async-icon">
        <Icon name="landmark" size={24} />
      </span>
      <h3>{t('donate.instapayTitle')}</h3>
      <p>{t('donate.instapayBody')}</p>
      <div className="reference-box">
        <small>{t('donate.instapayAddress')}</small>
        <CopyButton value={response.action.ipa} label={t('common.copy')} copiedLabel={t('common.copied')} />
        <small>{t('donate.transferReference')}</small>
        <CopyButton value={response.action.reference} label={t('common.copy')} copiedLabel={t('common.copied')} />
      </div>
      <div className="async-amount">
        <span>{t('donate.summary.total')}</span>
        <strong>{f.money(response.breakdown.chargedMinor, response.breakdown.currency)}</strong>
      </div>
      <div className="async-actions">
        <Button
          icon="arrow-out"
          onClick={() => {
            onClose();
            goAdmin({ section: 'finance', financeTab: 'reconciliation' }, 'u_heba');
          }}
        >
          {t('proto.web.openFinance')}
        </Button>
        <Button variant="ghost" onClick={() => onFinish('pending')}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

function PendingStep({ response, onClose }: { response: CreateDonationResponse; onClose: () => void }) {
  const { t } = useT();
  const { goWeb } = usePrototype();
  return (
    <div className="result">
      <span className="result-icon result-pending">
        <Icon name="clock" size={30} />
      </span>
      <h3>{t('donate.pendingTitle')}</h3>
      <p>{t('proto.web.pendingSaved')}</p>
      <p className="mono-ref">{response.receiptNumber}</p>
      <Button
        icon="receipt"
        onClick={() => {
          onClose();
          goWeb({ page: 'account' });
        }}
      >
        {t('proto.web.goToPortal')}
      </Button>
    </div>
  );
}

export function LedgerSnippet({ reference, limit = 6 }: { reference: string; limit?: number }) {
  const { t, f } = useT();
  const lines = useRead((read) =>
    read
      .ledger({ limit: 400 })
      .filter((line: LedgerLine) => line.reference === reference)
      .slice(0, limit),
  );
  if (lines.length === 0) return null;
  return (
    <div className="ledger-snippet">
      <div className="ledger-snippet-head">
        <span>
          <Icon name="book-open" size={15} /> {t('proto.web.ledgerSample')}
        </span>
        <span className="badge badge-success">
          <Icon name="check" size={13} strokeWidth={2.4} /> {t('proto.web.balanced')}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t('admin.finance.columns.account')}</th>
            <th>{t('admin.finance.columns.debit')}</th>
            <th>{t('admin.finance.columns.credit')}</th>
          </tr>
        </thead>
        <tbody>
          {[...lines].reverse().map((line) => (
            <tr key={line.id}>
              <td>
                <AccountName account={line.account} />
              </td>
              <td className="num">{line.direction === 'debit' ? f.money(line.amountMinor, line.currency, { showCurrency: false }) : ''}</td>
              <td className="num">{line.direction === 'credit' ? f.money(line.amountMinor, line.currency, { showCurrency: false }) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccountName({ account }: { account: string }) {
  const { t } = useT();
  const [, kind = '', rest = ''] = account.split(':');
  const label =
    kind === 'clearing'
      ? `${t('admin.finance.accounts.clearing')} · ${rest}`
      : kind === 'bank'
        ? t('admin.finance.accounts.bank')
        : kind === 'case'
          ? t('admin.finance.accounts.case')
          : kind === 'gateway_fees'
            ? t('admin.finance.accounts.gateway_fees')
            : kind === 'fee_recovery'
              ? t('admin.finance.accounts.fee_recovery')
              : kind === 'fx'
                ? `${t('admin.finance.accounts.fx')} · ${rest}`
                : account;
  return (
    <span className="account-name" title={account}>
      {label}
    </span>
  );
}

function SuccessStep({ response, caseItem, onClose }: { response: CreateDonationResponse; caseItem: CaseSummary; onClose: () => void }) {
  const { t, f } = useT();
  const { goWeb } = usePrototype();
  const current = useRead((read) => read.caseBySlug(caseItem.slug));
  const fundedNow = current?.status === 'funded' && caseItem.status === 'published';
  return (
    <div className="result result-success">
      <span className="result-icon">
        <Icon name="check" size={32} strokeWidth={2.4} />
      </span>
      <h3>{t('donate.successTitle')}</h3>
      <p>{t('donate.successBody', { amount: f.money(response.breakdown.netToCaseMinor, response.breakdown.caseCurrency) })}</p>
      {fundedNow && (
        <p className="funded-callout">
          <Icon name="gift" size={18} /> {t('proto.web.fundedByYou')}
        </p>
      )}
      <dl className="receipt-mini">
        <div>
          <dt>{t('donate.receiptNumber')}</dt>
          <dd className="mono">{response.receiptNumber}</dd>
        </div>
        <div>
          <dt>{t('receipt.amount')}</dt>
          <dd>{f.money(response.breakdown.chargedMinor, response.breakdown.currency)}</dd>
        </div>
        <div>
          <dt>{t('receipt.net')}</dt>
          <dd>{f.money(response.breakdown.netToCaseMinor, response.breakdown.caseCurrency)}</dd>
        </div>
      </dl>
      <LedgerSnippet reference={response.receiptNumber} />
      <div className="async-actions">
        <Button
          icon="receipt"
          variant="outline"
          onClick={() => {
            onClose();
            goWeb({ page: 'account' });
          }}
        >
          {t('donate.viewReceipt')}
        </Button>
        <Button
          icon="heart"
          onClick={() => {
            onClose();
            goWeb({ page: 'cases' });
          }}
        >
          {t('donate.anotherDonation')}
        </Button>
      </div>
    </div>
  );
}

export function quickAmountsFor(currency: Currency) {
  return CURRENCY_META[currency].quickAmounts;
}
