import { computeCountdown } from '@yusr/core';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Live deadline chip for urgent cases: days while days remain, then hh:mm:ss. */
export function Countdown({ deadline }: { deadline: string | null }) {
  const theme = useTheme();
  const { t, f } = useI18n();
  const [now, setNow] = useState(Date.now);
  const countdown = computeCountdown(deadline, now);
  const everySecond = countdown !== null && !countdown.expired && countdown.days === 0;
  useEffect(() => {
    if (!countdown || countdown.expired) return;
    const timer = setInterval(() => setNow(Date.now()), everySecond ? 1_000 : 60_000);
    return () => clearInterval(timer);
  }, [countdown?.expired, everySecond]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!countdown) return null;
  const pad = (value: number) => f.number(value, { minimumIntegerDigits: 2, useGrouping: false });
  const text = countdown.expired
    ? t('case.ended')
    : countdown.days > 0
      ? t('units.daysLeft', { count: countdown.days })
      : `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`;
  const critical = countdown.level === 'critical' && !countdown.expired;
  const background = critical ? theme.colors.destructive : countdown.level === 'soon' ? theme.colors.warningSoft : theme.colors.card;
  const color = critical ? theme.colors.destructiveForeground : countdown.level === 'soon' ? theme.colors.warningSoftForeground : theme.colors.foreground;
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={`${t('a11y.countdown')}: ${text}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 27, borderRadius: 999, backgroundColor: background }}
    >
      <Icon name="clock" size={14} color={color} strokeWidth={2} />
      <Text variant="caption" weight="bold" color={color} style={{ fontVariant: ['tabular-nums'] }}>
        {text}
      </Text>
    </View>
  );
}
