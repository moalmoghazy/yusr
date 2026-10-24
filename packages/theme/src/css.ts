import { patternCssUrl, patternStyleFor } from './pattern';
import type { ColorScheme, SemanticColors, Theme, ToneName } from './tokens';

const kebab = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([a-z])(\d)/g, '$1-$2')
    .toLowerCase();

/** CSS custom-property name for a semantic color, e.g. primarySoft → --primary-soft. */
export function colorVar(key: keyof SemanticColors): string {
  return `--${kebab(key)}`;
}

const TONES: readonly ToneName[] = ['rose', 'slate', 'sky', 'gold', 'teal'];

function colorVariables(theme: Theme, scheme: ColorScheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors[scheme])) {
    vars[colorVar(key as keyof SemanticColors)] = value;
  }
  for (const tone of TONES) {
    const colors = theme.tones[scheme][tone];
    vars[`--tone-${tone}-soft`] = colors.soft;
    vars[`--tone-${tone}-soft-foreground`] = colors.softForeground;
    vars[`--tone-${tone}-solid`] = colors.solid;
  }
  vars['--y-shadow-sm'] = theme.shadow[scheme].sm;
  vars['--y-shadow-md'] = theme.shadow[scheme].md;
  vars['--y-shadow-lg'] = theme.shadow[scheme].lg;
  // The brand pattern follows the theme's colours: background-image: var(--y-pattern).
  vars['--y-pattern'] = patternCssUrl(patternStyleFor(theme, scheme));
  vars['--y-pattern-size'] = '144px';
  return vars;
}

function staticVariables(theme: Theme): Record<string, string> {
  const { typography, radius, motion, layout } = theme;
  return {
    '--y-font-display': typography.fonts.display,
    '--y-font-logo': typography.fonts.logo,
    '--y-font-wordmark': typography.fonts.wordmark,
    '--y-font-sans': typography.fonts.sans,
    '--y-font-mono': typography.fonts.mono,
    '--radius': `${radius.control}px`,
    '--y-radius-control': `${radius.control}px`,
    '--y-radius-card': `${radius.card}px`,
    '--y-radius-sheet': `${radius.sheet}px`,
    '--y-radius-chip': `${radius.chip}px`,
    '--y-duration-fast': `${motion.fastMs}ms`,
    '--y-duration-base': `${motion.baseMs}ms`,
    '--y-duration-slow': `${motion.slowMs}ms`,
    '--y-ease-standard': motion.easeStandard,
    '--y-ease-emphasized': motion.easeEmphasized,
    '--y-container': `${layout.containerPx}px`,
    '--y-gutter': `${layout.gutterPx}px`,
  };
}

/** All variables for one scheme — handy for applying a theme at runtime (theme playground). */
export function cssVariables(theme: Theme, scheme: ColorScheme): Record<string, string> {
  return { ...staticVariables(theme), ...colorVariables(theme, scheme) };
}

function block(selector: string, vars: Record<string, string>, extra = ''): string {
  const body = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n${extra}${body}\n}`;
}

/**
 * Complete stylesheet: light on :root, dark via [data-theme="dark"] / .dark,
 * and the OS preference when the user has not chosen explicitly.
 */
export function cssText(theme: Theme): string {
  const dark = colorVariables(theme, 'dark');
  const darkBody = Object.entries(dark)
    .map(([name, value]) => `    ${name}: ${value};`)
    .join('\n');
  return [
    `/* Generated from @yusr/theme (${theme.name}). Edit packages/theme/src, not this file. */`,
    block(':root', { ...staticVariables(theme), ...colorVariables(theme, 'light') }, '  color-scheme: light;\n'),
    block(':root[data-theme="dark"],\n.dark', dark, '  color-scheme: dark;\n'),
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]):not(.light) {\n    color-scheme: dark;\n${darkBody}\n  }\n}`,
  ].join('\n\n');
}

/** Tailwind v4 `@theme inline` block mapping utilities (bg-primary, rounded-card…) to the variables. */
export function tailwindThemeCss(theme: Theme): string {
  const lines: string[] = [];
  for (const key of Object.keys(theme.colors.light)) {
    const name = colorVar(key as keyof SemanticColors).slice(2);
    lines.push(`  --color-${name}: var(--${name});`);
  }
  for (const tone of TONES) {
    for (const part of ['soft', 'soft-foreground', 'solid']) {
      lines.push(`  --color-tone-${tone}-${part}: var(--tone-${tone}-${part});`);
    }
  }
  lines.push(
    '  --font-display: var(--y-font-display);',
    '  --font-logo: var(--y-font-logo);',
    '  --font-wordmark: var(--y-font-wordmark);',
    '  --font-sans: var(--y-font-sans);',
    '  --font-mono: var(--y-font-mono);',
    '  --radius-sm: calc(var(--radius) - 4px);',
    '  --radius-md: calc(var(--radius) - 2px);',
    '  --radius-lg: var(--radius);',
    '  --radius-xl: calc(var(--radius) + 4px);',
    '  --radius-control: var(--y-radius-control);',
    '  --radius-card: var(--y-radius-card);',
    '  --radius-sheet: var(--y-radius-sheet);',
    '  --radius-chip: var(--y-radius-chip);',
    '  --shadow-sm: var(--y-shadow-sm);',
    '  --shadow-md: var(--y-shadow-md);',
    '  --shadow-lg: var(--y-shadow-lg);',
    '  --ease-standard: var(--y-ease-standard);',
    '  --ease-emphasized: var(--y-ease-emphasized);',
  );
  return `/* Generated from @yusr/theme. */\n@theme inline {\n${lines.join('\n')}\n}\n`;
}
