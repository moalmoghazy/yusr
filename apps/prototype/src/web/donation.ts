import {
  CURRENCY_META,
  DomainError,
  computeDonationBreakdown,
  methodsForCurrency,
  parseAmountInput,
  toMinor,
  type CaseSummary,
  type CreateDonationResponse,
  type Currency,
  type DomainErrorCode,
  type DonationType,
  type PaymentMethod,
} from '@yusr/core';
import { CURRENT_DONOR } from '@yusr/sdk/mock';
import { useEffect, useMemo, useState } from 'react';
import { backend } from '../app/backend';

export interface DonationDraftOptions {
  presetMinor?: number;
  channel: 'web' | 'mobile';
  locale: 'ar' | 'en';
}

/** Shared checkout state for the web dialog and the mobile sheet — same rules as the API. */
export function useDonationDraft(item: CaseSummary, options: DonationDraftOptions) {
  const [currency, setCurrencyState] = useState<Currency>(item.currency);
  // Show digits the way the interface writes them (Arabic-Indic in Arabic); parsing accepts both.
  const digits = (value: number) =>
    new Intl.NumberFormat(options.locale === 'ar' ? 'ar-EG' : 'en-US', { useGrouping: false, maximumFractionDigits: 2 }).format(value);
  const defaultAmount = (target: Currency) => digits(CURRENCY_META[target].quickAmounts[1] ?? CURRENCY_META[target].quickAmounts[0] ?? 100);
  const [amountInput, setAmountInput] = useState<string>(() => (options.presetMinor ? digits(options.presetMinor / 100) : defaultAmount(item.currency)));
  const [type, setType] = useState<DonationType>(item.zakatEligible ? 'zakat' : 'sadaqah');
  const [coverFees, setCoverFees] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [dedication, setDedication] = useState('');
  const [guest, setGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const methods = useMemo(() => methodsForCurrency(currency), [currency]);
  const [method, setMethod] = useState<PaymentMethod>(methods[0]!);

  useEffect(() => {
    if (!methods.includes(method)) setMethod(methods[0]!);
  }, [methods, method]);

  const setCurrency = (next: Currency) => {
    setCurrencyState(next);
    setAmountInput(defaultAmount(next));
  };

  const amountMajor = parseAmountInput(amountInput);
  const amountMinor = amountMajor ? toMinor(amountMajor, currency) : 0;
  const meta = CURRENCY_META[currency];

  const breakdown = useMemo(() => {
    if (amountMinor <= 0) return null;
    try {
      return computeDonationBreakdown({ amountMinor, currency, method, coverFees, caseCurrency: item.currency });
    } catch {
      return null;
    }
  }, [amountMinor, currency, method, coverFees, item.currency]);

  const coverPreview = useMemo(() => {
    if (amountMinor <= 0) return 0;
    try {
      return computeDonationBreakdown({ amountMinor, currency, method, coverFees: true, caseCurrency: item.currency }).donorCoveredFeeMinor;
    } catch {
      return 0;
    }
  }, [amountMinor, currency, method, item.currency]);

  let amountError: DomainErrorCode | null = null;
  if (amountInput.trim() && !amountMajor) amountError = 'VALIDATION_FAILED';
  else if (amountMinor > 0 && amountMinor < meta.minDonationMinor) amountError = 'AMOUNT_TOO_LOW';
  else if (guest && amountMinor > meta.guestMaxMinor) amountError = 'AMOUNT_TOO_HIGH_FOR_GUEST';

  const submit = (): CreateDonationResponse => {
    const displayName = guest ? (guestName.trim() ? { ar: guestName.trim(), en: guestName.trim() } : null) : CURRENT_DONOR.name;
    return backend.createDonation(
      {
        caseId: item.id,
        amountMinor,
        currency,
        method,
        coverFees,
        anonymous: anonymous || displayName === null,
        type: item.zakatEligible ? type : type === 'zakat' ? 'sadaqah' : type,
        dedication: dedication.trim() || null,
        donor: guest
          ? {
              name: guestName.trim() || null,
              email: guestContact.includes('@') ? guestContact.trim() : null,
              phone: guestContact.includes('@') ? null : guestContact.trim() || null,
            }
          : null,
        locale: options.locale,
      },
      { userId: guest ? null : CURRENT_DONOR.id, displayName, region: CURRENT_DONOR.region, channel: options.channel },
    );
  };

  return {
    currency,
    setCurrency,
    amountInput,
    setAmountInput,
    amountMinor,
    amountError,
    meta,
    type,
    setType,
    coverFees,
    setCoverFees,
    coverPreview,
    anonymous,
    setAnonymous,
    dedication,
    setDedication,
    guest,
    setGuest,
    guestName,
    setGuestName,
    guestContact,
    setGuestContact,
    methods,
    method,
    setMethod,
    breakdown,
    submit,
    canContinue: amountMinor > 0 && !amountError && breakdown !== null,
  };
}

export type DonationDraft = ReturnType<typeof useDonationDraft>;

export function errorCode(error: unknown): DomainErrorCode | 'generic' {
  return error instanceof DomainError ? error.code : 'generic';
}

export const METHOD_ICON: Record<PaymentMethod, 'credit-card' | 'smartphone' | 'store' | 'landmark' | 'wallet' | 'scan-face'> = {
  card: 'credit-card',
  apple_pay: 'scan-face',
  mada: 'credit-card',
  vodafone_cash: 'wallet',
  fawry: 'store',
  instapay: 'landmark',
};
