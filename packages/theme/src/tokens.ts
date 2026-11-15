import { green, orange, rose, sky, slate } from './palette';

export type ColorScheme = 'light' | 'dark';

/**
 * Semantic color roles. Names follow shadcn/ui conventions so its components work
 * unchanged; `accent` is the subtle hover surface (shadcn meaning), and the brand
 * gold lives in `highlight`.
 */
export interface SemanticColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  primaryHover: string;
  primarySoft: string;
  primarySoftForeground: string;
  secondary: string;
  secondaryForeground: string;
  secondarySoft: string;
  secondarySoftForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  highlight: string;
  highlightForeground: string;
  highlightSoft: string;
  highlightSoftForeground: string;
  destructive: string;
  destructiveForeground: string;
  destructiveSoft: string;
  destructiveSoftForeground: string;
  success: string;
  successForeground: string;
  successSoft: string;
  successSoftForeground: string;
  warning: string;
  warningForeground: string;
  warningSoft: string;
  warningSoftForeground: string;
  info: string;
  infoForeground: string;
  infoSoft: string;
  infoSoftForeground: string;
  border: string;
  borderStrong: string;
  input: string;
  ring: string;
  overlay: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
}

export type ToneName = 'rose' | 'slate' | 'sky' | 'gold' | 'teal';

/** Category tints for chips and illustrated case covers. */
export interface ToneColors {
  soft: string;
  softForeground: string;
  solid: string;
}

export interface Typography {
  /**
   * `display`: headings; `logo`: the name beside the mark (kept apart so headings can change alone);
   * `wordmark`: the Arabic face nearest the logo's lettering, for lines in the logo's voice.
   */
  fonts: { display: string; logo: string; wordmark: string; sans: string; mono: string };
  /** Google Fonts stylesheet for the web; mobile loads the same families via @expo-google-fonts. */
  googleFontsHref: string;
  /** Font family names registered in React Native (loaded in apps/mobile/src/app/_layout.tsx). */
  nativeFonts: { display: string; logo: string; wordmark: string; regular: string; medium: string; semibold: string; bold: string; mono: string };
  /** Type scale in px. */
  scale: Readonly<Record<'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl', number>>;
  /** Arabic needs more leading than Latin; body copy uses `relaxed` in RTL. */
  lineHeight: Readonly<Record<'tight' | 'snug' | 'normal' | 'relaxed', number>>;
}

export interface Theme {
  name: string;
  colors: Readonly<Record<ColorScheme, SemanticColors>>;
  tones: Readonly<Record<ColorScheme, Readonly<Record<ToneName, ToneColors>>>>;
  typography: Typography;
  /** Corner radii in px, assigned by role rather than one radius everywhere. */
  radius: Readonly<{ control: number; card: number; sheet: number; chip: number; pill: number }>;
  shadow: Readonly<Record<ColorScheme, { sm: string; md: string; lg: string }>>;
  motion: Readonly<{ fastMs: number; baseMs: number; slowMs: number; easeStandard: string; easeEmphasized: string }>;
  layout: Readonly<{ containerPx: number; gutterPx: number }>;
}

export const lightColors: SemanticColors = {
  background: '#F7F8F3',
  foreground: '#14261B',
  card: '#FFFFFF',
  cardForeground: '#14261B',
  popover: '#FFFFFF',
  popoverForeground: '#14261B',
  primary: green[600],
  primaryForeground: '#FFFFFF',
  primaryHover: green[700],
  primarySoft: '#E3F5E9',
  primarySoftForeground: green[800],
  secondary: orange[700],
  secondaryForeground: '#FFFFFF',
  secondarySoft: '#FFF1DB',
  secondarySoftForeground: orange[800],
  muted: '#EEF2EA',
  mutedForeground: '#56635A',
  accent: '#E9EFE4',
  accentForeground: '#14261B',
  highlight: orange[400],
  highlightForeground: '#2B1B05',
  highlightSoft: '#FEF0D6',
  highlightSoftForeground: orange[800],
  destructive: rose[600],
  destructiveForeground: '#FFFFFF',
  destructiveSoft: '#FDECEC',
  destructiveSoftForeground: '#9B1C23',
  success: '#17704A',
  successForeground: '#FFFFFF',
  successSoft: '#E1F3EA',
  successSoftForeground: '#145A3B',
  warning: '#B86E00',
  warningForeground: '#FFFFFF',
  warningSoft: '#FFF3DC',
  warningSoftForeground: '#7A4A00',
  info: slate[600],
  infoForeground: '#FFFFFF',
  infoSoft: '#E9EDF6',
  infoSoftForeground: slate[700],
  border: '#E0E6DA',
  borderStrong: '#C7D0C0',
  input: '#D3DBCC',
  ring: green[500],
  overlay: 'rgba(8, 22, 14, 0.55)',
  chart1: green[600],
  chart2: orange[400],
  chart3: green[300],
  chart4: rose[500],
  chart5: sky[500],
};

export const darkColors: SemanticColors = {
  background: '#08140D',
  foreground: '#E5F1E8',
  card: '#0F1E15',
  cardForeground: '#E5F1E8',
  popover: '#12241A',
  popoverForeground: '#E5F1E8',
  primary: green[400],
  primaryForeground: '#04210F',
  primaryHover: '#5FCF86',
  primarySoft: '#10301D',
  primarySoftForeground: '#A9E6BE',
  secondary: orange[300],
  secondaryForeground: '#2A1506',
  secondarySoft: '#34230F',
  secondarySoftForeground: '#FBD39A',
  muted: '#12241A',
  mutedForeground: '#93AA9B',
  accent: '#162B1F',
  accentForeground: '#E5F1E8',
  highlight: orange[400],
  highlightForeground: '#2B1B05',
  highlightSoft: '#33230C',
  highlightSoftForeground: '#FBD39A',
  destructive: '#F06B70',
  destructiveForeground: '#2A0507',
  destructiveSoft: '#3A1518',
  destructiveSoftForeground: '#FFB3B6',
  success: '#5CCB8C',
  successForeground: '#062212',
  successSoft: '#12301F',
  successSoftForeground: '#A6E8C2',
  warning: '#F2B24C',
  warningForeground: '#2A1A00',
  warningSoft: '#33250D',
  warningSoftForeground: '#F7D08D',
  info: '#8EA2CC',
  infoForeground: '#0E1424',
  infoSoft: '#1A2338',
  infoSoftForeground: '#B9C7E6',
  border: '#1B3324',
  borderStrong: '#27452F',
  input: '#27452F',
  ring: green[400],
  overlay: 'rgba(0, 0, 0, 0.62)',
  chart1: green[400],
  chart2: orange[400],
  chart3: '#A9E6BE',
  chart4: '#F06B70',
  chart5: '#6BB6F2',
};

export const defaultTones: Theme['tones'] = {
  light: {
    rose: { soft: '#FDEDEE', softForeground: rose[700], solid: rose[500] },
    slate: { soft: '#ECEFF7', softForeground: slate[700], solid: slate[500] },
    sky: { soft: '#E8F3FD', softForeground: sky[700], solid: sky[500] },
    gold: { soft: '#FEF0D6', softForeground: orange[800], solid: orange[500] },
    teal: { soft: '#E3F5E9', softForeground: green[800], solid: green[500] },
  },
  dark: {
    rose: { soft: '#3A1518', softForeground: '#FFB3B6', solid: '#F06B70' },
    slate: { soft: '#1A2338', softForeground: '#B9C7E6', solid: '#8EA2CC' },
    sky: { soft: '#10263B', softForeground: '#A9D3F6', solid: '#6BB6F2' },
    gold: { soft: '#33230C', softForeground: '#FBD39A', solid: orange[400] },
    teal: { soft: '#10301D', softForeground: '#A9E6BE', solid: green[400] },
  },
};

/**
 * Heading faces, all free (OFL) on Google Fonts and chosen for legibility at heading sizes.
 * `withDisplayFace(theme, face)` switches between them in one place (and the prototype's theming
 * playground compares them live on the whole platform).
 */
export const DISPLAY_FACES = {
  cairo: { family: 'Cairo', google: 'Cairo:wght@600;700;800', native: 'Cairo_700Bold' },
  tajawal: { family: 'Tajawal', google: 'Tajawal:wght@500;700;800', native: 'Tajawal_800ExtraBold' },
  notoKufiArabic: { family: 'Noto Kufi Arabic', google: 'Noto+Kufi+Arabic:wght@600;700', native: 'NotoKufiArabic_700Bold' },
  changa: { family: 'Changa', google: 'Changa:wght@600;700', native: 'Changa_700Bold' },
  almarai: { family: 'Almarai', google: 'Almarai:wght@700;800', native: 'Almarai_800ExtraBold' },
  /** The text face in bold: headings and text from one family (the default). */
  plexArabic: { family: 'IBM Plex Sans Arabic', google: 'IBM+Plex+Sans+Arabic:wght@300;400;500;600;700', native: 'IBMPlexSansArabic_700Bold' },
  /** Rounded display face, tried before the text family's bold was chosen. */
  lemonada: { family: 'Lemonada', google: 'Lemonada:wght@500;600;700', native: 'Lemonada_700Bold' },
  /** Geometric Fatimid Kufi: the face of the name in the logo, and the first heading face. */
  reemKufi: { family: 'Reem Kufi', google: 'Reem+Kufi:wght@500;600;700', native: 'ReemKufi_700Bold' },
  /** Classical Naskh: the free face nearest the approved lettering of «يُسر» (wordmark.ts). */
  amiri: { family: 'Amiri', google: 'Amiri:wght@400;700', native: 'Amiri_700Bold' },
} as const satisfies Record<string, { family: string; google: string; native: string }>;

export type DisplayFace = keyof typeof DISPLAY_FACES;

/** Headings are set in the text family's bold: one family, the clearest reading at every size. */
export const DEFAULT_DISPLAY_FACE: DisplayFace = 'plexArabic';
/** «يُسر» beside the mark is set in this face, whatever the headings use. */
export const LOGO_FACE: DisplayFace = 'reemKufi';
/** Fallback for lines in the logo's voice where the wordmark font is not shipped (the prototype). */
export const WORDMARK_FACE: DisplayFace = 'amiri';
/**
 * The face of the main page titles and the homepage's opening line, in Arabic: Palestine (one
 * weight, already heavy; its Latin letters, ḍamma and shadda are blank, so the web keeps Latin on
 * the text face). Not on Google Fonts: the web self-hosts it (apps/web/src/fonts) and mobile
 * bundles it (assets/fonts).
 */
export const WORDMARK_FONT = { family: 'Palestine', native: 'Palestine_400Regular' } as const;

/** The CSS font stack for a heading face, falling back to the text face. */
export function displayStack(face: DisplayFace): string {
  if (face === 'plexArabic') return '"IBM Plex Sans Arabic", "IBM Plex Sans", "Segoe UI", Tahoma, sans-serif';
  return `"${DISPLAY_FACES[face].family}", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif`;
}

const TEXT_FACES = 'family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700';

/** The Google Fonts stylesheet: the text faces, one heading face, the logo face and the wordmark face (bold only). */
export function webFontsHref(face: DisplayFace): string {
  const families = [TEXT_FACES];
  if (face !== 'plexArabic') families.push(`family=${DISPLAY_FACES[face].google}`);
  if (face !== LOGO_FACE) families.push('family=Reem+Kufi:wght@700');
  if (face !== WORDMARK_FACE) families.push('family=Amiri:wght@700');
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

export const defaultTypography: Typography = {
  fonts: {
    display: displayStack(DEFAULT_DISPLAY_FACE),
    logo: displayStack(LOGO_FACE),
    wordmark: `"${WORDMARK_FONT.family}", ${displayStack(WORDMARK_FACE)}`,
    sans: '"IBM Plex Sans Arabic", "IBM Plex Sans", "Segoe UI", Tahoma, Arial, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  googleFontsHref: webFontsHref(DEFAULT_DISPLAY_FACE),
  nativeFonts: {
    display: DISPLAY_FACES[DEFAULT_DISPLAY_FACE].native,
    logo: DISPLAY_FACES[LOGO_FACE].native,
    wordmark: WORDMARK_FONT.native,
    regular: 'IBMPlexSansArabic_400Regular',
    medium: 'IBMPlexSansArabic_500Medium',
    semibold: 'IBMPlexSansArabic_600SemiBold',
    bold: 'IBMPlexSansArabic_700Bold',
    mono: 'IBMPlexMono_400Regular',
  },
  scale: { xs: 12, sm: 14, base: 16, lg: 18, xl: 21, '2xl': 25, '3xl': 31, '4xl': 39, '5xl': 50 },
  lineHeight: { tight: 1.2, snug: 1.4, normal: 1.6, relaxed: 1.8 },
};

export const defaultTheme: Theme = {
  name: 'khatt',
  colors: { light: lightColors, dark: darkColors },
  tones: defaultTones,
  typography: defaultTypography,
  radius: { control: 10, card: 18, sheet: 26, chip: 999, pill: 999 },
  shadow: {
    light: {
      sm: '0 1px 2px rgba(20, 38, 27, 0.06), 0 1px 1px rgba(20, 38, 27, 0.04)',
      md: '0 6px 18px -6px rgba(28, 106, 60, 0.16), 0 2px 6px rgba(20, 38, 27, 0.05)',
      lg: '0 24px 48px -18px rgba(28, 106, 60, 0.26), 0 8px 18px -8px rgba(20, 38, 27, 0.10)',
    },
    dark: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
      md: '0 8px 22px -8px rgba(0, 0, 0, 0.6)',
      lg: '0 28px 56px -20px rgba(0, 0, 0, 0.75)',
    },
  },
  motion: {
    fastMs: 120,
    baseMs: 200,
    slowMs: 380,
    easeStandard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    easeEmphasized: 'cubic-bezier(0.34, 1.3, 0.5, 1)',
  },
  layout: { containerPx: 1200, gutterPx: 16 },
};
