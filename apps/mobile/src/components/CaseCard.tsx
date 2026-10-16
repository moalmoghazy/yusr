import { CATEGORY_META, CURRENCY_META, regionByCode, type CaseSummary } from '@yusr/core';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { CaseCover } from './CaseCover';
import { Countdown } from './Countdown';
import { Icon } from './Icon';
import { DonationProgress } from './Progress';
import { Text } from './Text';

/**
 * The native case card — same anatomy, data and copy as packages/ui/src/case-card.tsx on the web:
 * illustrated cover, verified shield and category, region and reference, honest progress, and
 * one-tap amounts that open the donate sheet preset. Funded cases link to where the money went.
 */
export function CaseCard({ item, onDonate, width }: { item: CaseSummary; onDonate: (item: CaseSummary, amountMinor?: number) => void; width?: number }) {
  const theme = useTheme();
  const { t, f, l } = useI18n();
  const open = item.status === 'published';
  const category = CATEGORY_META[item.category];
  const tone = theme.tones[category.tone];
  const currency = CURRENCY_META[item.currency];
  const region = regionByCode(item.region);

  return (
    <View
      style={[styles.card, theme.shadow.card, { width, backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: theme.radius.card }]}
    >
      <Link href={{ pathname: '/case/[slug]', params: { slug: item.slug } }} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={l(item.title)} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
          <View style={{ opacity: open ? 1 : 0.85 }}>
            <CaseCover category={item.category} seed={item.coverSeed} height={150} />
          </View>
          <View style={styles.coverTop}>
            {item.isUrgent && open ? <Countdown deadline={item.deadline} /> : <View />}
            {item.verifiedAt && (
              <View accessible accessibilityLabel={t('a11y.verifiedCase')} style={[styles.shield, { backgroundColor: theme.colors.card }]}>
                <Icon name="shield-check" size={16} color={theme.colors.primary} strokeWidth={2} />
              </View>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: theme.colors.card }]}>
            <Icon name={category.icon} size={13} color={tone.softForeground} strokeWidth={2} />
            <Text variant="caption" weight="semibold" color={tone.softForeground}>
              {t(`categories.${item.category}`)}
            </Text>
          </View>

          <View style={styles.body}>
            <View style={styles.meta}>
              <Text variant="caption" muted>
                {region ? l(region.name) : item.region}
              </Text>
              <Text variant="mono" muted style={{ fontSize: 12, writingDirection: 'ltr' }}>
                {item.reference}
              </Text>
            </View>
            <Text variant="title" numberOfLines={2}>
              {l(item.title)}
            </Text>
            <Text variant="label" weight="regular" muted numberOfLines={2}>
              {l(item.summary)}
            </Text>
            <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} donors={item.donorsCount} />
          </View>
        </Pressable>
      </Link>

      <View style={[styles.actions, { borderTopColor: theme.colors.border }]}>
        {open ? (
          <>
            <View style={styles.quick} role="group" accessibilityLabel={t('case.quickDonate')}>
              {currency.quickAmounts.slice(0, 3).map((amount) => {
                const minor = amount * 10 ** currency.exponent;
                return (
                  <Pressable
                    key={amount}
                    accessibilityRole="button"
                    accessibilityLabel={t('case.quickDonateAmount', { amount: f.money(minor, item.currency, { fractionDigits: 0 }) })}
                    onPress={() => onDonate(item, minor)}
                    style={({ pressed }) => [
                      styles.chip,
                      { borderColor: theme.colors.borderStrong, backgroundColor: pressed ? theme.colors.primarySoft : theme.colors.card },
                    ]}
                  >
                    <Text variant="label" weight="bold">
                      {f.number(amount)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => onDonate(item)}
              style={({ pressed }) => [
                styles.donate,
                { backgroundColor: theme.colors.primary, borderRadius: theme.radius.control, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Icon name="heart" size={16} color={theme.colors.primaryForeground} />
              <Text variant="label" weight="bold" color={theme.colors.primaryForeground}>
                {t('common.donate')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Link href={{ pathname: '/case/[slug]', params: { slug: item.slug, section: 'transparency' } }} asChild>
            <Pressable
              accessibilityRole="link"
              style={[styles.donate, { flex: 1, backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control }]}
            >
              <Icon name="receipt" size={16} color={theme.colors.primarySoftForeground} />
              <Text variant="label" weight="bold" color={theme.colors.primarySoftForeground}>
                {t('case.transparency')}
              </Text>
            </Pressable>
          </Link>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  coverTop: { position: 'absolute', top: 10, start: 10, end: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shield: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 112,
    start: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  body: { padding: 14, gap: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  quick: { flexDirection: 'row', gap: 6 },
  chip: { minWidth: 46, height: 36, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  donate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, paddingHorizontal: 14 },
});
