import { contrastRatio } from './color';
import type { ColorScheme, SemanticColors, Theme, ToneName } from './tokens';

/** A text color that must stay readable on a background, with its WCAG minimum. */
export interface ContrastPair {
  foreground: keyof SemanticColors;
  background: keyof SemanticColors;
  /** 7 for body text on page surfaces (AAA), 4.5 everywhere else (AA). */
  min: number;
}

/**
 * Every text/background combination the components actually render.
 * CI fails if any theme — default, preset or one derived from brand colors — drops below these.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: 'foreground', background: 'background', min: 7 },
  { foreground: 'foreground', background: 'card', min: 7 },
  { foreground: 'mutedForeground', background: 'background', min: 4.5 },
  { foreground: 'mutedForeground', background: 'card', min: 4.5 },
  { foreground: 'mutedForeground', background: 'muted', min: 4.5 },
  { foreground: 'primary', background: 'background', min: 4.5 },
  { foreground: 'primary', background: 'card', min: 4.5 },
  { foreground: 'primaryForeground', background: 'primary', min: 4.5 },
  { foreground: 'primarySoftForeground', background: 'primarySoft', min: 4.5 },
  { foreground: 'secondaryForeground', background: 'secondary', min: 4.5 },
  { foreground: 'secondarySoftForeground', background: 'secondarySoft', min: 4.5 },
  { foreground: 'highlightForeground', background: 'highlight', min: 4.5 },
  { foreground: 'highlightSoftForeground', background: 'highlightSoft', min: 4.5 },
  { foreground: 'destructiveForeground', background: 'destructive', min: 4.5 },
  { foreground: 'destructiveSoftForeground', background: 'destructiveSoft', min: 4.5 },
  { foreground: 'destructive', background: 'card', min: 4.5 },
  { foreground: 'successForeground', background: 'success', min: 4.5 },
  { foreground: 'successSoftForeground', background: 'successSoft', min: 4.5 },
  { foreground: 'warningSoftForeground', background: 'warningSoft', min: 4.5 },
  { foreground: 'infoSoftForeground', background: 'infoSoft', min: 4.5 },
  { foreground: 'accentForeground', background: 'accent', min: 4.5 },
];

export interface ContrastResult {
  scheme: ColorScheme;
  /** Token name, e.g. "primaryForeground" or "tone.rose.softForeground". */
  foreground: string;
  background: string;
  foregroundColor: string;
  backgroundColor: string;
  ratio: number;
  min: number;
  pass: boolean;
}

const TONES: readonly ToneName[] = ['rose', 'slate', 'sky', 'gold', 'teal'];

/** Checks every pair in light and dark, plus the category tones. */
export function auditContrast(theme: Theme): ContrastResult[] {
  const results: ContrastResult[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const colors = theme.colors[scheme];
    for (const pair of CONTRAST_PAIRS) {
      const ratio = contrastRatio(colors[pair.foreground], colors[pair.background]);
      results.push({
        scheme,
        foreground: pair.foreground,
        background: pair.background,
        foregroundColor: colors[pair.foreground],
        backgroundColor: colors[pair.background],
        ratio,
        min: pair.min,
        pass: ratio >= pair.min,
      });
    }
    for (const tone of TONES) {
      const value = theme.tones[scheme][tone];
      const ratio = contrastRatio(value.softForeground, value.soft);
      results.push({
        scheme,
        foreground: `tone.${tone}.softForeground`,
        background: `tone.${tone}.soft`,
        foregroundColor: value.softForeground,
        backgroundColor: value.soft,
        ratio,
        min: 4.5,
        pass: ratio >= 4.5,
      });
    }
  }
  return results;
}

/** Human-readable failures; empty when the theme is fully accessible. */
export function contrastFailures(theme: Theme): string[] {
  return auditContrast(theme)
    .filter((result) => !result.pass)
    .map((r) => `${theme.name}/${r.scheme}: ${r.foreground} on ${r.background} = ${r.ratio.toFixed(2)} (< ${r.min})`);
}
