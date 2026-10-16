import { ensureContrast, mix } from './color';
import { DISPLAY_FACES, darkColors, defaultTheme, displayStack, lightColors, webFontsHref, type DisplayFace, type SemanticColors, type Theme } from './tokens';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return result as T;
}

/** Override any part of the default theme — colors, fonts, radii, motion. */
export function createTheme(overrides?: DeepPartial<Theme>, base: Theme = defaultTheme): Theme {
  return deepMerge(base, overrides);
}

/** The heading face a theme uses, when it is one of DISPLAY_FACES. */
export function displayFaceOf(theme: Theme): DisplayFace | undefined {
  return (Object.keys(DISPLAY_FACES) as DisplayFace[]).find((face) => theme.typography.fonts.display === displayStack(face));
}

/**
 * Switches the heading face everywhere a theme names it: the CSS font stack, the web-font
 * stylesheet and the React Native font name. Returns the theme itself if it already uses it.
 * (The website loads its fonts with next/font and the app with @expo-google-fonts, by name:
 * see docs/BRAND.md → Type.)
 */
export function withDisplayFace(theme: Theme, face: DisplayFace): Theme {
  if (displayFaceOf(theme) === face) return theme;
  return createTheme(
    {
      typography: {
        fonts: { display: displayStack(face) },
        googleFontsHref: webFontsHref(face),
        nativeFonts: { display: DISPLAY_FACES[face].native },
      },
    },
    theme,
  );
}

export interface BrandColorInput {
  name: string;
  /** Main brand color. Automatically darkened if white text on it would fail WCAG AA. */
  primary: string;
  /** Warm accent used for the logo mark, milestones and "funded" moments. */
  highlight: string;
  radiusScale?: number;
}

/**
 * Derives a complete, accessible light + dark theme from two brand colors.
 * This is what the admin "Branding" settings and the prototype's theme playground call.
 */
export function themeFromBrandColors(input: BrandColorInput, base: Theme = defaultTheme): Theme {
  const lightBackground = mix('#F5F7F6', input.primary, 0.035);
  // Text on the page background is the strictest case (it is darker than white).
  const primary = ensureContrast(input.primary, lightBackground, 4.6);
  const lightSoft = mix(primary, '#FFFFFF', 0.89);

  const light: SemanticColors = {
    ...lightColors,
    background: lightBackground,
    muted: mix('#ECF0EE', primary, 0.04),
    accent: mix('#E7ECEA', primary, 0.06),
    border: mix('#DEE3E1', primary, 0.06),
    borderStrong: mix('#C6CFCB', primary, 0.08),
    input: mix('#D0D8D5', primary, 0.07),
    primary,
    primaryHover: mix(primary, '#000000', 0.18),
    primarySoft: lightSoft,
    primarySoftForeground: ensureContrast(mix(primary, '#000000', 0.35), lightSoft, 4.6),
    ring: mix(primary, '#FFFFFF', 0.12),
    chart1: primary,
    highlight: input.highlight,
    highlightForeground: ensureContrast(mix(input.highlight, '#000000', 0.8), input.highlight, 4.6),
    highlightSoft: mix(input.highlight, '#FFFFFF', 0.86),
    highlightSoftForeground: ensureContrast(mix(input.highlight, '#000000', 0.55), mix(input.highlight, '#FFFFFF', 0.86), 4.6),
    chart2: input.highlight,
  };

  const darkBackground = mix('#0B0F0E', primary, 0.1);
  const darkPrimary = ensureContrast(mix(primary, '#FFFFFF', 0.38), darkBackground, 4.6);
  const darkSoft = mix(primary, darkBackground, 0.76);

  const dark: SemanticColors = {
    ...darkColors,
    background: darkBackground,
    card: mix(darkBackground, '#FFFFFF', 0.035),
    popover: mix(darkBackground, '#FFFFFF', 0.055),
    muted: mix(darkBackground, '#FFFFFF', 0.05),
    accent: mix(darkBackground, '#FFFFFF', 0.07),
    border: mix(darkBackground, '#FFFFFF', 0.1),
    borderStrong: mix(darkBackground, '#FFFFFF', 0.16),
    input: mix(darkBackground, '#FFFFFF', 0.16),
    primary: darkPrimary,
    primaryHover: mix(darkPrimary, '#FFFFFF', 0.15),
    primaryForeground: ensureContrast(mix(primary, '#000000', 0.8), darkPrimary, 4.6),
    primarySoft: darkSoft,
    primarySoftForeground: ensureContrast(mix(primary, '#FFFFFF', 0.62), darkSoft, 4.6),
    ring: darkPrimary,
    chart1: darkPrimary,
    highlight: mix(input.highlight, '#FFFFFF', 0.18),
    highlightSoft: mix(input.highlight, darkBackground, 0.8),
    highlightSoftForeground: mix(input.highlight, '#FFFFFF', 0.45),
    chart2: mix(input.highlight, '#FFFFFF', 0.18),
  };

  const scale = input.radiusScale ?? 1;
  return {
    ...base,
    name: input.name,
    colors: { light, dark },
    radius: {
      control: Math.round(base.radius.control * scale),
      card: Math.round(base.radius.card * scale),
      sheet: Math.round(base.radius.sheet * scale),
      chip: base.radius.chip,
      pill: base.radius.pill,
    },
  };
}

/** Ready-made alternatives that show how far a two-color swap goes. */
export const presets = {
  emerald: defaultTheme,
  nile: themeFromBrandColors({ name: 'nile', primary: '#1B5E8C', highlight: '#D9A441' }),
  olive: themeFromBrandColors({ name: 'olive', primary: '#56702B', highlight: '#C47A3A' }),
  rosewood: themeFromBrandColors({ name: 'rosewood', primary: '#8A2F52', highlight: '#D8A94B' }),
} as const satisfies Record<string, Theme>;

export type PresetName = keyof typeof presets;
