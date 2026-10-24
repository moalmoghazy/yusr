import { Text as NativeText, type TextProps } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

type Variant = 'body' | 'caption' | 'label' | 'title' | 'heading' | 'display' | 'mono';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface YusrTextProps extends TextProps {
  variant?: Variant;
  weight?: Weight;
  color?: string;
  muted?: boolean;
  align?: 'auto' | 'center';
}

/**
 * Text in the brand's fonts and scale. Arabic gets the taller line height it needs;
 * `writingDirection` follows the app language so mixed Arabic/English lines order correctly.
 * Alignment is left to the platform ("auto" = the start of the line in the app's direction):
 * iOS and Android disagree on whether `left`/`right` flip in RTL, so we never set them.
 */
export function Text({ variant = 'body', weight, color, muted, align = 'auto', style, ...props }: YusrTextProps) {
  const theme = useTheme();
  const { rtl } = useI18n();
  const size = {
    body: theme.fontSize.base,
    caption: theme.fontSize.xs,
    label: theme.fontSize.sm,
    title: theme.fontSize.lg,
    heading: theme.fontSize['2xl'],
    display: theme.fontSize['3xl'],
    mono: theme.fontSize.sm,
  }[variant];
  const resolved: Weight = weight ?? (variant === 'title' || variant === 'heading' ? 'bold' : variant === 'label' ? 'semibold' : 'regular');
  // Screen titles and the opening line are set in Palestine, in Arabic (WORDMARK_FONT).
  const titled = rtl && (variant === 'display' || variant === 'heading');
  const family = titled ? theme.fonts.wordmark : variant === 'display' ? theme.fonts.display : variant === 'mono' ? theme.fonts.mono : theme.fonts[resolved];
  return (
    <NativeText
      {...props}
      style={[
        {
          fontFamily: family,
          fontSize: size,
          lineHeight: Math.round(size * (rtl ? theme.lineHeight.relaxed : theme.lineHeight.normal)),
          color: color ?? (muted ? theme.colors.mutedForeground : theme.colors.foreground),
          textAlign: align === 'center' ? 'center' : 'auto',
          writingDirection: rtl ? 'rtl' : 'ltr',
        },
        style,
      ]}
    />
  );
}
