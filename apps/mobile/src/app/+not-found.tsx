import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** A link the app doesn't know (an old share link, a mistyped deep link). */
export default function NotFound() {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: '' }} />
      <EmptyState icon="compass" title={t('errors.NOT_FOUND')} action={{ title: t('nav.home'), onPress: () => router.replace('/') }} />
    </View>
  );
}
