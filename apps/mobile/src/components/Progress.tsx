import { computeProgress, type Currency } from '@yusr/core';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Text } from './Text';

/** Same honesty rules and the same golden leading dot as the website's DonationProgress. */
export function DonationProgress({
  raisedMinor,
  goalMinor,
  currency,
  donors,
  large,
}: {
  raisedMinor: number;
  goalMinor: number;
  currency: Currency;
  donors?: number;
  large?: boolean;
}) {
  const theme = useTheme();
  const { t, f } = useI18n();
  const progress = computeProgress(raisedMinor, goalMinor);
  const width = progress.percent > 0 ? Math.max(progress.percent, 2) : 0;
  const fill = progress.isFunded ? theme.colors.highlight : theme.colors.primary;
  const track = large ? 12 : 8;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <Text variant={large ? 'heading' : 'body'} weight="bold">
          {f.money(raisedMinor, currency, { fractionDigits: 0 })}{' '}
          <Text variant="caption" muted>
            {t('common.of')} {f.money(goalMinor, currency, { fractionDigits: 0 })}
          </Text>
        </Text>
        <Text variant="label" weight="bold" color={progress.isFunded ? theme.colors.highlightSoftForeground : theme.colors.primary}>
          {f.percent(progress.percent)}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('a11y.progress', { percent: f.percent(progress.percent) })}
        accessibilityValue={{ min: 0, max: 100, now: progress.percent }}
        style={{ height: track, borderRadius: track, backgroundColor: theme.colors.muted }}
      >
        <View style={{ width: `${width}%`, height: track, borderRadius: track, backgroundColor: fill }}>
          {!progress.isFunded && width > 0 && (
            <View
              style={[
                styles.dot,
                {
                  width: track + 5,
                  height: track + 5,
                  borderRadius: track,
                  top: -2.5,
                  end: -(track + 5) / 2,
                  backgroundColor: theme.colors.highlight,
                  borderColor: theme.colors.card,
                },
              ]}
            />
          )}
        </View>
      </View>
      <View style={styles.row}>
        {donors !== undefined ? (
          <Text variant="caption" muted>
            {t('units.donors', { count: donors })}
          </Text>
        ) : (
          <View />
        )}
        <Text variant="caption" muted>
          {progress.isFunded ? t('case.fundedBadge') : `${t('case.remaining')} ${f.money(progress.remainingMinor, currency, { fractionDigits: 0 })}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  dot: { position: 'absolute', borderWidth: 2.5 },
});
