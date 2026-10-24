import { gold, neutral, rose, sky, slate, teal } from './palette';

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
  background: neutral[50],
  foreground: '#10201C',
  card: '#FFFFFF',
  cardForeground: '#10201C',
  popover: '#FFFFFF',
  popoverForeground: '#10201C',
  primary: teal[600],
  primaryForeground: '#FFFFFF',
  primaryHover: teal[700],
  primarySoft: '#E3F3EE',
  primarySoftForeground: teal[800],
  secondary: slate[600],
  secondaryForeground: '#FFFFFF',
  secondarySoft: '#E9EDF6',
  secondarySoftForeground: slate[700],
  muted: '#EBF1EF',
  mutedForeground: '#55645F',
  accent: '#E6EEEB',
  accentForeground: '#10201C',
  highlight: gold[400],
  highlightForeground: '#2B1B05',
  highlightSoft: '#FBF1DA',
  highlightSoftForeground: gold[800],
  destructive: rose[600],
  destructiveForeground: '#FFFFFF',
  destructiveSoft: '#FDECEC',
  destructiveSoftForeground: '#9B1C23',
  success: '#1E7A48',
  successForeground: '#FFFFFF',
  successSoft: '#E4F4EA',
  successSoftForeground: '#175E38',
  warning: '#B86E00',
  warningForeground: '#FFFFFF',
  warningSoft: '#FFF3DC',
  warningSoftForeground: '#7A4A00',
  info: slate[600],
  infoForeground: '#FFFFFF',
  infoSoft: '#E9EDF6',
  infoSoftForeground: slate[700],
  border: '#DCE4E1',
  borderStrong: '#C3CFCA',
  input: '#CFD9D5',
  ring: teal[500],
  overlay: 'rgba(8, 20, 17, 0.55)',
  chart1: teal[600],
  chart2: gold[500],
  chart3: slate[500],
  chart4: rose[500],
  chart5: sky[500],
};

export const darkColors: SemanticColors = {
  background: '#0A1311',
  foreground: '#E6EFEC',
  card: '#101C19',
  cardForeground: '#E6EFEC',
  popover: '#13211D',
  popoverForeground: '#E6EFEC',
  primary: '#3DBA99',
  primaryForeground: '#03201A',
  primaryHover: '#5ACBAD',
  primarySoft: '#0F2F28',
  primarySoftForeground: '#8FE0C9',
  secondary: '#8EA2CC',
  secondaryForeground: '#0E1424',
  secondarySoft: '#1A2338',
  secondarySoftForeground: '#B9C7E6',
  muted: '#15231F',
  mutedForeground: '#98ABA5',
  accent: '#182824',
  accentForeground: '#E6EFEC',
  highlight: '#E9B75A',
  highlightForeground: '#2B1B05',
  highlightSoft: '#2E2410',
  highlightSoftForeground: '#F3D08F',
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
  border: '#1F302B',
  borderStrong: '#2A3F39',
  input: '#2A3F39',
  ring: '#3DBA99',
  overlay: 'rgba(0, 0, 0, 0.62)',
  chart1: '#3DBA99',
  chart2: '#E9B75A',
  chart3: '#8EA2CC',
  chart4: '#F06B70',
  chart5: '#6BB6F2',
};

export const defaultTones: Theme['tones'] = {
  light: {
    rose: { soft: '#FDEDEE', softForeground: rose[700], solid: rose[500] },
    slate: { soft: '#ECEFF7', softForeground: slate[700], solid: slate[500] },
    sky: { soft: '#E8F3FD', softForeground: sky[700], solid: sky[500] },
    gold: { soft: '#FBF1DA', softForeground: gold[800], solid: gold[500] },
    teal: { soft: '#E3F3EE', softForeground: teal[800], solid: teal[500] },
  },
  dark: {
    rose: { soft: '#3A1518', softForeground: '#FFB3B6', solid: '#F06B70' },
    slate: { soft: '#1A2338', softForeground: '#B9C7E6', solid: '#8EA2CC' },
    sky: { soft: '#10263B', softForeground: '#A9D3F6', solid: '#6BB6F2' },
    gold: { soft: '#2E2410', softForeground: '#F3D08F', solid: '#E9B75A' },
    teal: { soft: '#0F2F28', softForeground: '#8FE0C9', solid: '#3DBA99' },
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
  name: 'emerald',
  colors: { light: lightColors, dark: darkColors },
  tones: defaultTones,
  typography: defaultTypography,
  radius: { control: 10, card: 18, sheet: 26, chip: 999, pill: 999 },
  shadow: {
    light: {
      sm: '0 1px 2px rgba(16, 32, 28, 0.06), 0 1px 1px rgba(16, 32, 28, 0.04)',
      md: '0 6px 18px -6px rgba(15, 91, 77, 0.18), 0 2px 6px rgba(16, 32, 28, 0.05)',
      lg: '0 24px 48px -18px rgba(15, 91, 77, 0.28), 0 8px 18px -8px rgba(16, 32, 28, 0.10)',
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
