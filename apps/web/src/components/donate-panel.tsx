'use client';

import {
  CURRENCY_META,
  DEDICATION_MAX_LENGTH,
  DONATION_TYPES,
  feeRuleFor,
  grossUpForFee,
  methodsForCurrency,
  parseAmountInput,
  resolveProvider,
  toMinor,
  type Currency,
  type Locale,
  type PaymentMethod,
} from '@yusr/core';
import { buttonClasses, cn, Icon, textFor, type IconName } from '@yusr/ui';
import Link from 'next/link';
import { useActionState, useEffect, useId, useState } from 'react';
import { startDonation, type DonateState } from '@/lib/donate';

const METHOD_ICON: Record<PaymentMethod, IconName> = {
  card: 'credit-card',
  apple_pay: 'smartphone',
  mada: 'credit-card',
  vodafone_cash: 'wallet',
  fawry: 'store',
  instapay: 'landmark',
};

export interface DonatePanelProps {
  locale: Locale;
  caseId: string;
  currency: Currency;
  zakatEligible: boolean;
  /** From `?amount=` (minor units) when the donor came from a quick-amount chip. */
  initialAmountMinor?: number | null;
  /** One idempotency key per attempt, minted on the server so hydration matches. */
  attemptKey: string;
}

/**
 * The donate form. Everything a donor decides is here, in the order they decide it: amount,
 * intention (sadaqah / zakat), payment method, fees, name on the wall, receipt contact.
 * It posts to a server action, so it works before JavaScript loads; with JavaScript it shows
 * the fee and total live and keeps the donor on the page for errors and offline payments.
 */
export function DonatePanel({ locale, caseId, currency, zakatEligible, initialAmountMinor, attemptKey }: DonatePanelProps) {
  const { t, f } = textFor(locale);
  const meta = CURRENCY_META[currency];
  const methods = methodsForCurrency(currency);
  const initialMajor =
    initialAmountMinor && initialAmountMinor >= meta.minDonationMinor
      ? initialAmountMinor / 10 ** meta.exponent
      : (meta.quickAmounts[1] ?? meta.quickAmounts[0]!);

  // Shown in the interface's digits (١٠٠ in Arabic); parseAmountInput reads either kind back.
  const digits = (value: number) => f.number(value, { useGrouping: false, maximumFractionDigits: meta.exponent });
  const [amount, setAmount] = useState(() => digits(initialMajor));
  const [method, setMethod] = useState<PaymentMethod>(methods[0]!);
  const [coverFees, setCoverFees] = useState(true);
  const [key, setKey] = useState(attemptKey);
  const [state, submit, pending] = useActionState<DonateState, FormData>(startDonation, { status: 'idle' });
  const ids = useId();

  // A failed attempt created nothing to replay; the next one gets a fresh key.
  useEffect(() => {
    if (state.status === 'error') setKey(crypto.randomUUID());
  }, [state]);

  const major = parseAmountInput(amount);
  const amountMinor = major === null ? null : toMinor(major, currency);
  const provider = resolveProvider(method, currency);
  const feeMinor = amountMinor && provider ? grossUpForFee(amountMinor, feeRuleFor(provider, method)) - amountMinor : 0;
  const totalMinor = amountMinor ? amountMinor + (coverFees ? feeMinor : 0) : null;
  const tooLow = amountMinor !== null && amountMinor < meta.minDonationMinor;
  const invalid = (field: string) => state.status === 'error' && state.fields.includes(field);

  if (state.status === 'offline') return <OfflineInstructions locale={locale} state={state} />;

  return (
    <form action={submit} className="flex flex-col gap-5" aria-describedby={state.status === 'error' ? `${ids}-error` : undefined}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="idempotencyKey" value={key} />

      {/* ---------------------------------------------------------- amount */}
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-sm font-bold">{t('donate.chooseAmount')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {meta.quickAmounts.map((value) => {
            const selected = major === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setAmount(digits(value))}
                className={cn(
                  'h-11 rounded-control border text-sm font-bold tabular-nums outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  selected ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-border-strong bg-card hover:border-primary',
                )}
              >
                {f.number(value)}
              </button>
            );
          })}
        </div>
        <label className="relative">
          <span className="sr-only">{t('donate.customAmount')}</span>
          <input
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={tooLow || invalid('amountMinor') || undefined}
            className="h-12 w-full rounded-control border border-input bg-card pe-16 ps-4 text-lg font-bold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-[invalid]:border-destructive"
          />
          <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{f.currencyLabel(currency)}</span>
        </label>
        <p className={cn('text-xs', tooLow ? 'text-destructive' : 'text-muted-foreground')}>
          {t('donate.minAmount', { amount: f.money(meta.minDonationMinor, currency) })}
        </p>
      </fieldset>

      {/* ---------------------------------------------------------- intention */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">{t('donate.type')}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-control bg-muted p-1">
          {DONATION_TYPES.map((type) => {
            const disabled = type === 'zakat' && !zakatEligible;
            return (
              <label key={type} className={cn('relative', disabled && 'opacity-50')}>
                <input type="radio" name="type" value={type} defaultChecked={type === 'sadaqah'} disabled={disabled} className="peer sr-only" />
                <span className="block cursor-pointer rounded-[calc(var(--y-radius-control)-4px)] py-2 text-center text-sm font-semibold text-muted-foreground transition-colors peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed">
                  {t(`donationType.${type}`)}
                </span>
              </label>
            );
          })}
        </div>
        {!zakatEligible && <p className="text-xs text-muted-foreground">{t('donate.zakatUnavailable')}</p>}
      </fieldset>

      {/* ---------------------------------------------------------- method */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">{t('donate.method')}</legend>
        {methods.map((item) => (
          <label key={item} className="cursor-pointer">
            <input type="radio" name="method" value={item} checked={method === item} onChange={() => setMethod(item)} className="peer sr-only" />
            <span className="flex items-center gap-3 rounded-control border border-border bg-card p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary-soft/60 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-primary">
                <Icon name={METHOD_ICON[item]} size={18} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold">{t(`payment.methods.${item}`)}</span>
                <span className="truncate text-xs text-muted-foreground">{t(`payment.methodHints.${item}`)}</span>
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* ---------------------------------------------------------- options */}
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="coverFees"
            checked={coverFees}
            onChange={(event) => setCoverFees(event.target.checked)}
            className="mt-1 size-4 accent-[var(--primary)]"
          />
          <span>{t('donate.coverFees', { fee: f.money(feeMinor, currency) })}</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" name="anonymous" className="mt-1 size-4 accent-[var(--primary)]" />
          <span className="flex flex-col">
            {t('donate.anonymous')}
            <span className="text-xs text-muted-foreground">{t('donate.anonymousHint')}</span>
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">
            {t('donate.dedication')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
          </span>
          <input
            name="dedication"
            maxLength={DEDICATION_MAX_LENGTH}
            placeholder={t('donate.dedicationPlaceholder')}
            className="h-11 rounded-control border border-input bg-card px-3 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            dir="auto"
          />
        </label>
      </div>

      {/* ---------------------------------------------------------- receipt contact */}
      <fieldset className="flex flex-col gap-2.5 rounded-control border border-border p-4">
        <legend className="px-1 text-sm font-bold">{t('donate.guestTitle')}</legend>
        <p className="text-xs text-muted-foreground">{t('donate.guestHint')}</p>
        {(
          [
            ['name', t('donate.name'), 'text', 'name'],
            ['email', t('donate.email'), 'email', 'email'],
            ['phone', t('donate.phone'), 'tel', 'tel'],
          ] as const
        ).map(([name, label, type, autoComplete]) => (
          <label key={name} className="flex flex-col gap-1">
            <span className="text-xs font-semibold">{label}</span>
            <input
              name={name}
              type={type}
              autoComplete={autoComplete}
              dir={name === 'name' ? 'auto' : 'ltr'}
              aria-invalid={(name !== 'name' && invalid('donor')) || invalid(name) || undefined}
              className="h-11 rounded-control border border-input bg-card px-3 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-[invalid]:border-destructive"
            />
          </label>
        ))}
      </fieldset>

      {/* ---------------------------------------------------------- summary + pay */}
      {totalMinor !== null && (
        <dl className="flex flex-col gap-1.5 rounded-control bg-muted/70 p-4 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('donate.summary.amount')}</dt>
            <dd>{f.money(amountMinor!, currency)}</dd>
          </div>
          {coverFees && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('donate.summary.covered')}</dt>
              <dd>{f.money(feeMinor, currency)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1.5 font-bold">
            <dt>{t('donate.summary.total')}</dt>
            <dd>{f.money(totalMinor, currency)}</dd>
          </div>
        </dl>
      )}

      {state.status === 'error' && (
        <p id={`${ids}-error`} role="alert" className="flex items-start gap-2 rounded-control bg-destructive-soft p-3 text-sm text-destructive-soft-foreground">
          <Icon name="alert" size={18} className="mt-0.5" />
          {state.fields.includes('donor') ? t('donate.contactRequired') : t(`errors.${state.code}`)}
        </p>
      )}

      <button type="submit" disabled={pending || totalMinor === null || tooLow} className={buttonClasses({ size: 'lg', block: true })}>
        <Icon name={pending ? 'refresh' : 'lock'} size={18} className={pending ? 'motion-safe:animate-spin' : undefined} />
        {pending ? t('donate.redirecting') : t('donate.pay', { amount: totalMinor === null ? '' : f.money(totalMinor, currency) })}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Icon name="shield-check" size={14} />
        {t('donate.secureNote')}
      </p>
    </form>
  );
}

function OfflineInstructions({ locale, state }: { locale: Locale; state: Extract<DonateState, { status: 'offline' }> }) {
  const { t, f } = textFor(locale);
  const { action } = state;
  const rows =
    action.type === 'fawry_reference'
      ? [[t('donate.fawryReference'), action.referenceNumber]]
      : [
          [t('donate.instapayAddress'), action.ipa],
          [t('donate.transferReference'), action.reference],
        ];
  return (
    <section aria-live="polite" className="flex flex-col gap-4">
      <h3 className="text-lg font-bold">{action.type === 'fawry_reference' ? t('donate.fawryTitle') : t('donate.instapayTitle')}</h3>
      <p className="text-sm text-muted-foreground">{action.type === 'fawry_reference' ? t('donate.fawryBody') : t('donate.instapayBody')}</p>
      <dl className="flex flex-col gap-2">
        <div className="flex items-center justify-between rounded-control bg-muted p-3">
          <dt className="text-sm text-muted-foreground">{t('donate.summary.total')}</dt>
          <dd className="font-bold tabular-nums">{f.money(state.chargedMinor, state.currency)}</dd>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-control border border-dashed border-primary/50 p-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-mono text-lg font-bold tracking-wider" dir="ltr">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{t('donate.expiresAt', { date: f.dateTime(action.expiresAt) })}</p>
      <Link href={state.receiptUrl} className={buttonClasses({ variant: 'outline', block: true })}>
        <Icon name="receipt" size={17} />
        {t('donate.viewReceipt')}
      </Link>
    </section>
  );
}
