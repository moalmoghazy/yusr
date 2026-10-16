import {
  CURRENCY_META,
  DONATION_TYPES,
  feeRuleFor,
  grossUpForFee,
  methodsForCurrency,
  parseAmountInput,
  resolveProvider,
  toE164,
  toMinor,
  type CaseSummary,
  type CreateDonationRequest,
  type CreateDonationResponse,
  type DonationType,
  type PaymentMethod,
} from '@yusr/core';
import { ApiError } from '@yusr/sdk';
import type { IconName } from '@yusr/ui/icons';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, RETURN_URL } from '@/lib/api';
import { runCheckout, type OfflineAction } from '@/lib/checkout';
import { useI18n } from '@/lib/i18n';
import { saveReceipt } from '@/lib/receipts';
import { useTheme } from '@/lib/theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

const METHOD_ICON: Record<PaymentMethod, IconName> = {
  card: 'credit-card',
  apple_pay: 'smartphone',
  mada: 'credit-card',
  vodafone_cash: 'wallet',
  fawry: 'store',
  instapay: 'landmark',
};

export interface DonateTarget {
  item: CaseSummary;
  /** Preset from a quick-amount chip, in minor units. */
  presetMinor?: number;
}

/** The native donate sheet: the website's donate form, one screen, thumb-friendly. */
export function DonateSheet({ target, onClose }: { target: DonateTarget | null; onClose: () => void }) {
  return (
    <Modal visible={target !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {target && <DonateForm key={`${target.item.id}:${target.presetMinor ?? ''}`} target={target} onClose={onClose} />}
    </Modal>
  );
}

type Offline = { action: OfflineAction; chargedMinor: number; donationId: string; token: string };

function DonateForm({ target, onClose }: { target: DonateTarget; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, t, f, l } = useI18n();
  const { item } = target;
  const currency = item.currency;
  const meta = CURRENCY_META[currency];
  // Apple Pay only exists on iPhone; Android donors see every other method for the currency.
  const methods = methodsForCurrency(currency).filter((option) => option !== 'apple_pay' || Platform.OS === 'ios');
  const digits = (value: number) => f.number(value, { useGrouping: false, maximumFractionDigits: meta.exponent });
  const presetMajor = target.presetMinor && target.presetMinor >= meta.minDonationMinor ? target.presetMinor / 10 ** meta.exponent : null;

  const [amount, setAmount] = useState(() => digits(presetMajor ?? meta.quickAmounts[1] ?? meta.quickAmounts[0]!));
  const [type, setType] = useState<DonationType>('sadaqah');
  const [method, setMethod] = useState<PaymentMethod>(methods[0]!);
  const [coverFees, setCoverFees] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [offline, setOffline] = useState<Offline | null>(null);
  // One idempotency key per distinct attempt: retrying the same donation never charges twice,
  // and changing anything after a cancelled payment starts a new one.
  const [attempt, setAttempt] = useState<{ key: string; body: string } | null>(null);

  const major = parseAmountInput(amount);
  const amountMinor = major === null ? null : toMinor(major, currency);
  const provider = resolveProvider(method, currency);
  const feeMinor = amountMinor && provider ? grossUpForFee(amountMinor, feeRuleFor(provider, method)) - amountMinor : 0;
  const totalMinor = amountMinor ? amountMinor + (coverFees ? feeMinor : 0) : null;
  const tooLow = amountMinor !== null && amountMinor < meta.minDonationMinor;

  async function pay() {
    setProblem(null);
    if (amountMinor === null || tooLow) {
      setProblem(t('donate.minAmount', { amount: f.money(meta.minDonationMinor, currency, { fractionDigits: 0 }) }));
      return;
    }
    const contactEmail = email.trim() || null;
    const contactPhone = toE164(phone.trim() || null, currency === 'SAR' ? 'SA' : currency === 'EGP' ? 'EG' : null);
    if (!contactEmail && !contactPhone) {
      setProblem(t('donate.contactRequired'));
      return;
    }
    const request: CreateDonationRequest = {
      caseId: item.id,
      amountMinor,
      currency,
      method,
      coverFees,
      anonymous,
      type,
      dedication: null,
      donor: { name: name.trim() || null, email: contactEmail, phone: contactPhone },
      locale,
      returnUrl: RETURN_URL,
    };
    const body = JSON.stringify(request);
    const key = attempt?.body === body ? attempt.key : Crypto.randomUUID();
    setAttempt({ key, body });

    setBusy(true);
    try {
      let created: CreateDonationResponse;
      try {
        created = await api(locale).createDonation(request, { idempotencyKey: key });
      } catch (error) {
        // Refused outright (validation, closed case…): nothing was created, so the next try is new.
        if (error instanceof ApiError && error.status < 500) setAttempt(null);
        throw error;
      }
      await saveReceipt(created.donationId, created.receiptToken);
      const outcome = await runCheckout(created, t('common.appName'));
      if (outcome.kind === 'canceled') return;
      if (outcome.kind === 'offline') {
        setOffline({ action: outcome.action, chargedMinor: created.breakdown.chargedMinor, donationId: created.donationId, token: created.receiptToken });
        return;
      }
      onClose();
      router.push({ pathname: '/receipt', params: { donation: created.donationId, token: created.receiptToken } });
    } catch (error) {
      setProblem(error instanceof ApiError ? t(`errors.${error.code}`) : t('mobile.offline'));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title">{t('donate.title')}</Text>
        <Text variant="caption" muted numberOfLines={1}>
          {l(item.title)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        hitSlop={12}
        style={[styles.close, { backgroundColor: theme.colors.muted }]}
      >
        <Icon name="x" size={18} color={theme.colors.foreground} />
      </Pressable>
    </View>
  );

  if (offline) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {header}
        <OfflineInstructions
          offline={offline}
          currency={currency}
          onReceipt={() => {
            onClose();
            router.push({ pathname: '/receipt', params: { donation: offline.donationId, token: offline.token } });
          }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 18, gap: 22, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Section title={t('donate.chooseAmount')}>
          <View style={styles.wrap}>
            {meta.quickAmounts.map((value) => (
              <Chip
                key={value}
                selected={major === value}
                onPress={() => setAmount(digits(value))}
                label={f.money(value * 10 ** meta.exponent, currency, { fractionDigits: 0 })}
              />
            ))}
          </View>
          <Field
            label={t('donate.customAmount')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            inputMode="decimal"
            suffix={f.currencyLabel(currency)}
            invalid={tooLow}
            large
          />
          <Text variant="caption" muted color={tooLow ? theme.colors.destructive : undefined}>
            {t('donate.minAmount', { amount: f.money(meta.minDonationMinor, currency, { fractionDigits: 0 }) })}
          </Text>
        </Section>

        <Section title={t('donate.type')}>
          <View role="radiogroup" accessibilityLabel={t('donate.type')} style={[styles.segment, { backgroundColor: theme.colors.muted }]}>
            {DONATION_TYPES.map((option) => {
              const disabled = option === 'zakat' && !item.zakatEligible;
              const selected = option === type;
              return (
                <Pressable
                  key={option}
                  role="radio"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() => setType(option)}
                  style={[styles.segmentItem, selected && { backgroundColor: theme.colors.card }, disabled && { opacity: 0.45 }]}
                >
                  <Text variant="label" weight={selected ? 'bold' : 'medium'} color={selected ? theme.colors.primary : undefined}>
                    {t(`donationType.${option}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!item.zakatEligible && (
            <Text variant="caption" muted>
              {t('donate.zakatUnavailable')}
            </Text>
          )}
        </Section>

        <Section title={t('donate.method')}>
          <View role="radiogroup" accessibilityLabel={t('donate.method')} style={{ gap: 8 }}>
            {methods.map((option) => {
              const selected = option === method;
              return (
                <Pressable
                  key={option}
                  role="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setMethod(option)}
                  style={[
                    styles.option,
                    {
                      borderRadius: theme.radius.control,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? theme.colors.primarySoft : theme.colors.card,
                    },
                  ]}
                >
                  <Icon name={METHOD_ICON[option]} size={20} color={selected ? theme.colors.primarySoftForeground : theme.colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold">{t(`payment.methods.${option}`)}</Text>
                    <Text variant="caption" muted>
                      {t(`payment.methodHints.${option}`)}
                    </Text>
                  </View>
                  <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.borderStrong }]}>
                    {selected && <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <View style={{ gap: 14 }}>
          <SwitchRow value={coverFees} onValueChange={setCoverFees} label={t('donate.coverFees', { fee: f.money(feeMinor, currency) })} />
          <SwitchRow value={anonymous} onValueChange={setAnonymous} label={t('donate.anonymous')} hint={t('donate.anonymousHint')} />
        </View>

        <Section title={t('donate.guestTitle')} hint={t('donate.guestHint')}>
          <Field label={`${t('donate.name')} (${t('common.optional')})`} value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
          <Field
            label={t('donate.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            ltr
          />
          <Field
            label={t('donate.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            ltr
          />
        </Section>

        {totalMinor !== null && (
          <View style={[styles.summary, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: theme.radius.card }]}>
            <Row label={t('donate.summary.amount')} value={f.money(amountMinor ?? 0, currency)} />
            {coverFees && feeMinor > 0 && <Row label={t('donate.summary.covered')} value={f.money(feeMinor, currency)} />}
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }} />
            <Row label={t('donate.summary.total')} value={f.money(totalMinor, currency)} strong />
          </View>
        )}

        {problem && (
          <View
            accessibilityLiveRegion="polite"
            role="alert"
            style={[styles.problem, { backgroundColor: theme.colors.destructiveSoft, borderRadius: theme.radius.control }]}
          >
            <Icon name="alert" size={18} color={theme.colors.destructiveSoftForeground} />
            <Text variant="label" weight="medium" color={theme.colors.destructiveSoftForeground} style={{ flex: 1 }}>
              {problem}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14), borderTopColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
        <Button
          title={totalMinor ? t('donate.pay', { amount: f.money(totalMinor, currency) }) : t('common.donate')}
          icon="heart"
          onPress={pay}
          loading={busy}
          disabled={amountMinor === null || tooLow}
        />
        <View style={styles.secure}>
          <Icon name="lock" size={13} color={theme.colors.mutedForeground} />
          <Text variant="caption" muted>
            {t('donate.secureNote')}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Fawry and InstaPay settle later: the reference to pay with, copyable, and the receipt to follow. */
function OfflineInstructions({ offline, currency, onReceipt }: { offline: Offline; currency: CaseSummary['currency']; onReceipt: () => void }) {
  const theme = useTheme();
  const { t, f } = useI18n();
  const { action } = offline;
  const fawry = action.type === 'fawry_reference';
  const rows: Array<{ label: string; value: string; copy?: boolean }> = fawry
    ? [{ label: t('donate.fawryReference'), value: action.referenceNumber, copy: true }]
    : [
        { label: t('donate.instapayAddress'), value: action.ipa, copy: true },
        { label: t('donate.name'), value: action.accountName },
        { label: t('donate.transferReference'), value: action.reference, copy: true },
      ];
  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.highlightSoft }}>
          <Icon name={fawry ? 'store' : 'landmark'} size={28} color={theme.colors.highlightSoftForeground} />
        </View>
        <Text variant="title" align="center">
          {t(fawry ? 'donate.fawryTitle' : 'donate.instapayTitle')}
        </Text>
        <Text align="center" muted>
          {t(fawry ? 'donate.fawryBody' : 'donate.instapayBody')}
        </Text>
      </View>
      <View style={[styles.summary, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: theme.radius.card }]}>
        <Row label={t('donate.summary.total')} value={f.money(offline.chargedMinor, currency)} strong />
        {rows.map((row) => (
          <View key={row.label} style={{ gap: 4 }}>
            <Text variant="caption" muted>
              {row.label}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="mono" selectable style={{ flex: 1, fontSize: 18, writingDirection: 'ltr' }}>
                {row.value}
              </Text>
              {row.copy && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('common.copy')}: ${row.label}`}
                  hitSlop={10}
                  onPress={() => void Clipboard.setStringAsync(row.value)}
                >
                  <Icon name="copy" size={18} color={theme.colors.primary} />
                </Pressable>
              )}
            </View>
          </View>
        ))}
        <Text variant="caption" muted>
          {t('donate.expiresAt', { date: f.dateTime(action.expiresAt) })}
        </Text>
      </View>
      <Button title={t('donate.viewReceipt')} icon="receipt" variant="soft" onPress={onReceipt} />
    </ScrollView>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text variant="label" weight="bold">
          {title}
        </Text>
        {hint && (
          <Text variant="caption" muted>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? theme.colors.primary : theme.colors.borderStrong, backgroundColor: selected ? theme.colors.primary : theme.colors.card },
      ]}
    >
      <Text variant="label" weight="bold" color={selected ? theme.colors.primaryForeground : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  suffix,
  invalid,
  large,
  ltr,
  style,
  ...props
}: TextInputProps & { label: string; suffix?: string; invalid?: boolean; large?: boolean; ltr?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" weight="semibold" muted>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            borderRadius: theme.radius.control,
            borderColor: invalid ? theme.colors.destructive : theme.colors.input,
            backgroundColor: theme.colors.card,
            height: large ? 56 : 48,
          },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={theme.colors.mutedForeground}
          style={[
            {
              flex: 1,
              fontFamily: large ? theme.fonts.bold : theme.fonts.regular,
              fontSize: large ? theme.fontSize.xl : theme.fontSize.base,
              color: theme.colors.foreground,
              // Emails and phone numbers read left to right even in Arabic.
              writingDirection: ltr ? 'ltr' : undefined,
            },
            style,
          ]}
          {...props}
        />
        {suffix && (
          <Text variant="label" weight="semibold" muted>
            {suffix}
          </Text>
        )}
      </View>
    </View>
  );
}

function SwitchRow({ value, onValueChange, label, hint }: { value: boolean; onValueChange: (value: boolean) => void; label: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" weight="medium">
          {label}
        </Text>
        {hint && (
          <Text variant="caption" muted>
            {hint}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.primary, false: theme.colors.muted }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant={strong ? 'body' : 'label'} weight={strong ? 'bold' : 'regular'} muted={!strong}>
        {label}
      </Text>
      <Text variant={strong ? 'body' : 'label'} weight={strong ? 'bold' : 'semibold'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 72, height: 42, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 14 },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 12, gap: 4 },
  segmentItem: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  summary: { gap: 10, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  problem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  footer: { gap: 8, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
