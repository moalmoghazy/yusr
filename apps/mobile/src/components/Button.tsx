import type { IconName } from '@yusr/ui/icons';
import { ActivityIndicator, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'soft' | 'outline' | 'ghost';

export function Button({
  title,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & { title: string; icon?: IconName; variant?: Variant; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const colors = {
    primary: { bg: theme.colors.primary, fg: theme.colors.primaryForeground, border: theme.colors.primary },
    soft: { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftForeground, border: theme.colors.primarySoft },
    outline: { bg: theme.colors.card, fg: theme.colors.foreground, border: theme.colors.borderStrong },
    ghost: { bg: 'transparent', fg: theme.colors.primary, border: 'transparent' },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 18,
          borderRadius: theme.radius.control,
          borderWidth: 1,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={colors.fg} /> : icon ? <Icon name={icon} size={18} color={colors.fg} /> : null}
      <Text variant="label" weight="bold" color={colors.fg}>
        {title}
      </Text>
    </Pressable>
  );
}
