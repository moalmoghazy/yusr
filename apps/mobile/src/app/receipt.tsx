import type { DonationReceipt } from '@yusr/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Text } from '@/components/Text';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { saveReceipt } from '@/lib/receipts';
import { IN_FLIGHT, statusColors } from '@/lib/status';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@/lib/use-query';

const POLL_MS = 4_000;
const POLL_FOR_MS = 120_000;

/**
 * The receipt, opened by gateways returning to yusr://receipt?donation=…&token=… (or from
 * «تبرعاتي»). A donor often lands here a moment before the gateway's webhook confirms the payment,
 * so while it is still in flight the screen checks again every few seconds, for two minutes.
 */
export default function ReceiptScreen() {
  const params = useLocalSearchParams<{ donation?: string; token?: string }>();
  const donationId = params.donation ? String(params.donation) : null;
  const token = params.token ? String(params.token) : undefined;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, t, f, l } = useI18n();
  const query = useQuery<DonationReceipt | null>(`receipt:${locale}:${donationId}`, async () =>
    donationId ? api(locale).getDonation(donationId, token) : null,
  );
  const receipt = query.data ?? null;
  const inFlight = receipt !== null && IN_FLIGHT.has(receipt.status);

  // Opened from a link on this device: keep it under «تبرعاتي».
  useEffect(() => {
    if (donationId && token) void saveReceipt(donationId, token);
  }, [donationId, token]);

  useEffect(() => {
    if (!inFlight) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) clearInterval(timer);
      else query.refetch();
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight]);

  if (!donationId) return <EmptyState icon="receipt" title={t('errors.NOT_FOUND')} />;
  if (query.loading && !receipt) return <Loading />;
  if (query.error && !receipt) return <ErrorState error={query.error} onRetry={query.refresh} />;
  if (!receipt) return <EmptyState icon="receipt" title={t('errors.NOT_FOUND')} />;

  const succeeded = receipt.status === 'succeeded';
  const failed = receipt.status === 'failed' || receipt.status === 'canceled' || receipt.status === 'expired';
  const tone = statusColors(receipt.status, theme.colors);
  const title = succeeded
    ? t('donate.successTitle')
    : failed
      ? t('donate.failedTitle')
      : inFlight
        ? t('donate.processing')
        : t(`donationStatus.${receipt.status}`);
  const body = succeeded
    ? t('donate.successBody', { amount: f.money(receipt.netToCaseMinor, receipt.caseCurrency) })
    : failed
      ? t('donate.failedBody')
      : receipt.status === 'awaiting_transfer'
        ? t('donate.instapayBody')
        : null;

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 18 }}
      refreshControl={<RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} tintColor={theme.colors.primary} />}
    >
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }} accessibilityLiveRegion="polite">
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Icon name={succeeded ? 'check' : failed ? 'x' : 'clock'} size={30} color={tone.fg} strokeWidth={2.4} />
        </View>
        <Text variant="heading" align="center">
          {title}
        </Text>
        {body && (
          <Text align="center" muted>
            {body}
          </Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: theme.radius.card }]}>
        <Line label={t('donate.receiptNumber')}>
          <Text variant="mono" selectable style={{ writingDirection: 'ltr' }}>
            {receipt.receiptNumber}
          </Text>
        </Line>
        <Line label={t('receipt.status')} value={t(`donationStatus.${receipt.status}`)} />
        <Line label={t('receipt.case')} value={l(receipt.caseTitle)} />
        <Line label={t('receipt.date')} value={f.dateTime(receipt.succeededAt ?? receipt.createdAt)} />
        <Line label={t('receipt.method')} value={`${t(`payment.methods.${receipt.method}`)} · ${t(`payment.providers.${receipt.provider}`)}`} />
        <Line label={t('donate.type')} value={t(`donationType.${receipt.type}`)} />
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }} />
        <Line label={t('receipt.amount')} value={f.money(receipt.chargedMinor, receipt.currency)} />
        {receipt.feeMinor > 0 && <Line label={t('receipt.fee')} value={f.money(receipt.feeMinor, receipt.currency)} />}
        <Line label={t('receipt.net')} value={f.money(receipt.netToCaseMinor, receipt.caseCurrency)} strong />
      </View>

      <Text variant="caption" muted align="center">
        {t('receipt.note')}
      </Text>

      <Button
        title={t('case.transparency')}
        icon="receipt"
        variant="soft"
        onPress={() => router.push({ pathname: '/case/[slug]', params: { slug: receipt.caseSlug, section: 'transparency' } })}
      />
      {failed && (
        <Button
          title={t('common.retry')}
          icon="refresh"
          variant="outline"
          onPress={() => router.push({ pathname: '/case/[slug]', params: { slug: receipt.caseSlug } })}
        />
      )}
    </ScrollView>
  );
}

function Line({ label, value, strong, children }: { label: string; value?: string; strong?: boolean; children?: ReactNode }) {
  return (
    <View style={styles.line}>
      <Text variant="label" weight="regular" muted>
        {label}
      </Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
        {children ?? (
          <Text variant={strong ? 'body' : 'label'} weight={strong ? 'bold' : 'semibold'} style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  card: { gap: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
});
