import type { DonationReceipt } from '@yusr/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Text } from '@/components/Text';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { savedReceipts } from '@/lib/receipts';
import { statusColors } from '@/lib/status';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@/lib/use-query';

interface Row {
  receipt: DonationReceipt;
  token: string;
}

/**
 * «تبرعاتي»: donations made from this device, read back from the API with the receipt token
 * saved at checkout — so a guest donor follows each gift without creating an account.
 */
export default function Donations() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, t, f, l } = useI18n();
  const query = useQuery<Row[]>(`donations:${locale}`, async () => {
    const saved = await savedReceipts();
    const results = await Promise.allSettled(saved.map((entry) => api(locale).getDonation(entry.donationId, entry.receiptToken)));
    return results.flatMap((result, index) => (result.status === 'fulfilled' ? [{ receipt: result.value, token: saved[index]!.receiptToken }] : []));
  });

  // Coming back to the tab (say, after donating) quietly picks up the new receipt and statuses.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      query.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 8 }}>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(row) => row.receipt.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 4, paddingBottom: 8 }}>
            <Text variant="heading" accessibilityRole="header">
              {t('mobile.tabs.donations')}
            </Text>
            <Text variant="label" weight="regular" muted>
              {t('mobile.donationsHint')}
            </Text>
          </View>
        }
        ListEmptyComponent={
          query.loading ? (
            <Loading />
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={query.refresh} />
          ) : (
            <EmptyState icon="heart" title={t('mobile.donationsEmpty')} action={{ title: t('landing.heroPrimary'), onPress: () => router.push('/explore') }} />
          )
        }
        refreshControl={<RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} tintColor={theme.colors.primary} />}
        renderItem={({ item: { receipt, token } }) => {
          const tone = statusColors(receipt.status, theme.colors);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/receipt', params: { donation: receipt.id, token } })}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: theme.radius.card, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: theme.colors.primarySoft }]}>
                <Icon name="receipt" size={20} color={theme.colors.primarySoftForeground} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text weight="semibold" numberOfLines={2}>
                  {l(receipt.caseTitle)}
                </Text>
                <View style={styles.meta}>
                  <Text variant="label" weight="bold" style={{ fontVariant: ['tabular-nums'] }}>
                    {f.money(receipt.chargedMinor, receipt.currency)}
                  </Text>
                  <Text variant="caption" muted>
                    {f.date(receipt.createdAt, 'medium')}
                  </Text>
                </View>
                <View style={[styles.status, { backgroundColor: tone.bg }]}>
                  <Text variant="caption" weight="semibold" color={tone.fg}>
                    {t(`donationStatus.${receipt.status}`)}
                  </Text>
                </View>
              </View>
              <Icon name="forward" size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
});
