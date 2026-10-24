import type { CaseSummary, PlatformStats } from '@yusr/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaseCard } from '@/components/CaseCard';
import { DonateSheet, type DonateTarget } from '@/components/DonateSheet';
import { Icon } from '@/components/Icon';
import { Lockup, LogoMark } from '@/components/LogoMark';
import { ErrorState, Loading } from '@/components/States';
import { SupervisionBadge } from '@/components/SupervisionBadge';
import { Text } from '@/components/Text';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@/lib/use-query';

interface HomeData {
  stats: PlatformStats;
  urgent: CaseSummary[];
  closest: CaseSummary[];
}

/** Home: the regulator line and promise, the numbers, urgent cases, and cases close to their goal. */
export default function Home() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { locale, t, f } = useI18n();
  const [donating, setDonating] = useState<DonateTarget | null>(null);
  const query = useQuery<HomeData>(`home:${locale}`, async () => {
    const client = api(locale);
    const [stats, urgent, closest] = await Promise.all([
      client.stats(),
      client.listCases({ urgentOnly: true, sort: 'urgent', limit: 6 }),
      client.listCases({ sort: 'closest', limit: 4 }),
    ]);
    return { stats, urgent: urgent.items, closest: closest.items };
  });
  const onDonate = (item: CaseSummary, presetMinor?: number) => setDonating({ item, presetMinor });
  const railCard = Math.min(320, width - 56);
  const data = query.data;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 32, gap: 26 }}
        refreshControl={<RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} tintColor={theme.colors.primary} />}
      >
        <View style={[styles.pad, styles.topBar]}>
          <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel={t('a11y.logo')}>
            <Lockup size={30} />
          </View>
          <Text variant="caption" muted>
            {t(new Date().getHours() < 12 ? 'mobile.greetingMorning' : 'mobile.greetingEvening')}
          </Text>
        </View>

        <View style={[styles.pad, { gap: 14 }]}>
          <SupervisionBadge />
          <View style={styles.brand}>
            <LogoMark size={18} />
            <Text variant="label" weight="semibold" color={theme.colors.primary}>
              {t('landing.eyebrow')}
            </Text>
          </View>
          <Text variant="display" accessibilityRole="header">
            {t('landing.heroTitle')}
          </Text>
          <Text muted>{t('landing.heroBody')}</Text>
        </View>

        {query.loading && !data ? (
          <Loading />
        ) : query.error && !data ? (
          <ErrorState error={query.error} onRetry={query.refresh} />
        ) : data ? (
          <>
            <View style={[styles.pad, styles.stats]}>
              {[
                { value: f.money(data.stats.raisedMinor, 'EGP', { compact: true }), label: t('landing.stats.raised') },
                { value: f.number(data.stats.casesFunded), label: t('landing.stats.funded') },
                { value: f.compact(data.stats.donors), label: t('landing.stats.donors') },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={[styles.stat, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: theme.radius.control }]}
                >
                  <Text variant="title" color={theme.colors.primary} numberOfLines={1} adjustsFontSizeToFit>
                    {stat.value}
                  </Text>
                  <Text variant="caption" muted numberOfLines={2}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>

            {data.urgent.length > 0 && (
              <View style={{ gap: 12 }}>
                <SectionHeader title={t('mobile.urgentNow')} icon="clock" onSeeAll={() => router.push('/explore')} />
                <FlatList
                  horizontal
                  data={data.urgent}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
                  snapToInterval={railCard + 14}
                  decelerationRate="fast"
                  renderItem={({ item }) => <CaseCard item={item} onDonate={onDonate} width={railCard} />}
                />
              </View>
            )}

            <View style={{ gap: 12 }}>
              <SectionHeader title={t('mobile.forYou')} icon="trend-up" onSeeAll={() => router.push('/explore')} />
              <View style={[styles.pad, { gap: 16 }]}>
                {data.closest.map((item) => (
                  <CaseCard key={item.id} item={item} onDonate={onDonate} />
                ))}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
      <DonateSheet target={donating} onClose={() => setDonating(null)} />
    </View>
  );
}

function SectionHeader({ title, icon, onSeeAll }: { title: string; icon: 'clock' | 'trend-up'; onSeeAll: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.pad, styles.sectionHeader]}>
      <View style={styles.brand}>
        <Icon name={icon} size={18} color={theme.colors.primary} />
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Pressable accessibilityRole="link" onPress={onSeeAll} hitSlop={10} style={styles.brand}>
        <Text variant="label" weight="semibold" color={theme.colors.primary}>
          {t('common.seeAll')}
        </Text>
        <Icon name="arrow-forward" size={16} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
