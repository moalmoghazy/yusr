import type { ColorScheme, SemanticColors, Theme, ToneColors, ToneName, Typography } from './tokens';

export interface NativeShadow {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

export interface NativeTheme {
  scheme: ColorScheme;
  colors: SemanticColors;
  tones: Readonly<Record<ToneName, ToneColors>>;
  fonts: Typography['nativeFonts'];
  fontSize: Typography['scale'];
  lineHeight: Typography['lineHeight'];
  radius: Theme['radius'];
  /** 4-pt spacing grid: space(4) === 16. */
  space: (steps: number) => number;
  shadow: { card: NativeShadow; raised: NativeShadow };
  motion: Theme['motion'];
}

/** React Native flavour of the same tokens (numbers instead of CSS strings). */
export function toNativeTheme(theme: Theme, scheme: ColorScheme): NativeTheme {
  const dark = scheme === 'dark';
  return {
    scheme,
    colors: theme.colors[scheme],
    tones: theme.tones[scheme],
    fonts: theme.typography.nativeFonts,
    fontSize: theme.typography.scale,
    lineHeight: theme.typography.lineHeight,
    radius: theme.radius,
    space: (steps: number) => steps * 4,
    shadow: {
      card: {
        shadowColor: dark ? '#000000' : '#0F5B4D',
        shadowOpacity: dark ? 0.5 : 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      },
      raised: {
        shadowColor: dark ? '#000000' : '#0F5B4D',
        shadowOpacity: dark ? 0.6 : 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
      },
    },
    motion: theme.motion,
  };
}
