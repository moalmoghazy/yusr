import { CASE_CATEGORIES, CATEGORY_META, type CaseCategory, type CaseFilters, type CaseSummary } from '@yusr/core';
import type { IconName } from '@yusr/ui/icons';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaseCard } from '@/components/CaseCard';
import { DonateSheet, type DonateTarget } from '@/components/DonateSheet';
import { Icon } from '@/components/Icon';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Text } from '@/components/Text';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@/lib/use-query';

const PAGE = 10;

/** The catalog: search, category and urgency filters, and an endless list of cases. */
export default function Explore() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CaseCategory | null>(null);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [donating, setDonating] = useState<DonateTarget | null>(null);

  const filters: CaseFilters = {
    q: search || undefined,
    categories: category ? [category] : undefined,
    urgentOnly: urgentOnly || undefined,
    sort: urgentOnly ? 'urgent' : 'closest',
    limit: PAGE,
  };
  const key = JSON.stringify(filters);
  const first = useQuery(`explore:${locale}:${key}`, () => api(locale).listCases(filters));

  // Further pages belong to one filter combination; changing a filter starts again from page one.
  const [more, setMore] = useState<{ key: string; items: CaseSummary[]; cursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const extra = more?.key === key ? more : null;
  const items = [...(first.data?.items ?? []), ...(extra?.items ?? [])];
  const cursor = extra ? extra.cursor : (first.data?.nextCursor ?? null);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api(locale).listCases({ ...filters, cursor });
      setMore({ key, items: [...(extra?.items ?? []), ...page.items], cursor: page.nextCursor });
    } catch {
      // The next scroll to the end tries again.
    } finally {
      setLoadingMore(false);
    }
  }

  const chips: Array<{ id: string; label: string; icon?: IconName; selected: boolean; onPress: () => void }> = [
    { id: 'all', label: t('common.all'), selected: category === null, onPress: () => setCategory(null) },
    ...CASE_CATEGORIES.map((value) => ({
      id: value,
      label: t(`categories.${value}`),
      icon: CATEGORY_META[value].icon,
      selected: category === value,
      onPress: () => setCategory(category === value ? null : value),
    })),
  ];

  const header = (
    <View style={{ gap: 14, paddingBottom: 6 }}>
      <Text variant="heading" accessibilityRole="header" style={styles.pad}>
        {t('mobile.tabs.explore')}
      </Text>
      <View style={[styles.pad]}>
        <View style={[styles.search, { backgroundColor: theme.colors.card, borderColor: theme.colors.input, borderRadius: theme.radius.control }]}>
          <Icon name="search" size={18} color={theme.colors.mutedForeground} />
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => setSearch(text.trim())}
            onBlur={() => setSearch(text.trim())}
            returnKeyType="search"
            placeholder={t('common.search')}
            placeholderTextColor={theme.colors.mutedForeground}
            accessibilityLabel={t('common.search')}
            style={{ flex: 1, fontFamily: theme.fonts.regular, fontSize: theme.fontSize.base, color: theme.colors.foreground }}
          />
          {text.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.reset')}
              hitSlop={10}
              onPress={() => {
                setText('');
                setSearch('');
              }}
            >
              <Icon name="x" size={16} color={theme.colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {chips.map((chip) => (
          <FilterChip key={chip.id} {...chip} />
        ))}
        <FilterChip id="urgent" label={t('catalog.urgentOnly')} icon="clock" selected={urgentOnly} onPress={() => setUrgentOnly(!urgentOnly)} />
      </ScrollView>
      {first.data && (
        <Text variant="caption" muted style={styles.pad}>
          {t('units.results', { count: first.data.total })}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 8 }}>
      <FlatList
        data={first.data ? items : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <CaseCard item={item} onDonate={(target, presetMinor) => setDonating({ item: target, presetMinor })} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          first.loading ? (
            <Loading />
          ) : first.error ? (
            <ErrorState error={first.error} onRetry={first.refresh} />
          ) : (
            <EmptyState
              icon="search"
              title={t('catalog.empty')}
              body={t('catalog.emptyHint')}
              action={{
                title: t('catalog.clearFilters'),
                onPress: () => {
                  setText('');
                  setSearch('');
                  setCategory(null);
                  setUrgentOnly(false);
                },
              }}
            />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.primary} style={{ margin: 20 }} /> : <View style={{ height: 28 }} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={first.refreshing}
            onRefresh={() => {
              setMore(null);
              first.refresh();
            }}
            tintColor={theme.colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 0 }}
      />
      <DonateSheet target={donating} onClose={() => setDonating(null)} />
    </View>
  );
}

function FilterChip({ label, icon, selected, onPress }: { id: string; label: string; icon?: IconName; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const color = selected ? theme.colors.primaryForeground : theme.colors.foreground;
  return (
    <Pressable
      role="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.colors.primary : theme.colors.card, borderColor: selected ? theme.colors.primary : theme.colors.border },
      ]}
    >
      {icon && <Icon name={icon} size={15} color={color} />}
      <Text variant="label" weight="semibold" color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderWidth: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
});
