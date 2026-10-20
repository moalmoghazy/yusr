/**
 * @yusr/ui — the web's shared components (Next.js website + control hub).
 *
 * shadcn/ui conventions (Tailwind v4 utilities over the @yusr/theme tokens, `cn` for merging,
 * variants as class maps) with Yusr's domain pieces on top. Everything renders on the server
 * except CountdownBadge ('use client'). Styles come from the apps' Tailwind build, which scans
 * this package via `@source` (see apps/web/src/app/globals.css).
 */
export { cn } from './cn';
export { textFor, type Text } from './text';
export { ICON_NODES, DIRECTIONAL_ICONS, type IconName, type IconNode } from './icons';
export { Icon, type IconProps } from './icon';
export { PLATFORM_GLYPHS, PlatformIcon, type PlatformIconProps, type PlatformName } from './platform-icon';
export { Button, buttonClasses, type ButtonProps, type ButtonSize, type ButtonStyle, type ButtonVariant } from './button';
export { Badge, type BadgeTone } from './badge';
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
export { Logo, LogoMark, type LogoMarkProps } from './logo';
export { DonationProgress, ProgressBar, type DonationProgressProps, type ProgressBarProps, type ProgressSize } from './progress';
export { CaseCover, type CaseCoverProps } from './case-cover';
export { CategoryBadge, RegionLabel, StatusBadge, VerifiedBadge, ZakatBadge } from './case-badges';
export { CountdownBadge, type CountdownBadgeProps } from './countdown';
export { CaseCard, type CardLinkProps, type CaseCardProps, type LinkComponent } from './case-card';
export { DemoBanner } from './demo-banner';
