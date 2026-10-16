import { ApiError } from '@yusr/sdk';
import type { IconName } from '@yusr/ui/icons';
import { ActivityIndicator, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

export function Loading() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
    </View>
  );
}

/** A failed request, in words the donor can act on, with a retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const message = error instanceof ApiError && error.status < 500 ? t(`errors.${error.code}`) : t('mobile.offline');
  return (
    <View style={{ alignItems: 'center', gap: 12, padding: 32 }}>
      <Icon name="alert" size={28} color={theme.colors.mutedForeground} />
      <Text align="center" muted>
        {message}
      </Text>
      <Button title={t('common.retry')} icon="refresh" variant="outline" onPress={onRetry} />
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: { title: string; onPress: () => void } }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft }}>
        <Icon name={icon} size={28} color={theme.colors.primarySoftForeground} />
      </View>
      <Text variant="title" align="center">
        {title}
      </Text>
      {body && (
        <Text align="center" muted>
          {body}
        </Text>
      )}
      {action && <Button title={action.title} onPress={action.onPress} style={{ marginTop: 6 }} />}
    </View>
  );
}
