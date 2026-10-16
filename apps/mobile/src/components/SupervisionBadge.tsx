import { Image, View } from 'react-native';
import { showSupervision } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Text } from './Text';

/** The regulator line, as on the website: the ministry's logo on a white rounded tile + the statement. */
export function SupervisionBadge() {
  const theme = useTheme();
  const { t } = useI18n();
  if (!showSupervision) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 60, height: 60, padding: 4, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: theme.colors.border }}>
        <Image
          source={require('@yusr/theme/assets/partners/moss-egypt.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" weight="semibold" color={theme.colors.primary}>
          {t('landing.supervision.lead')}
        </Text>
        <Text variant="label" weight="semibold" color={theme.colors.primary}>
          {t('landing.supervision.authority')}
        </Text>
      </View>
    </View>
  );
}
