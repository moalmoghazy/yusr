import type { SVGProps } from 'react';
import { cn } from './cn';
import { DIRECTIONAL_ICONS, ICON_NODES, type IconName } from './icons';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Accessible name; decorative icons (the default) are hidden from assistive tech. */
  label?: string;
}

/** The shared Yusr icon (see icons.ts). Direction-aware icons mirror themselves in RTL. */
export function Icon({ name, size = 18, strokeWidth = 1.8, label, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', DIRECTIONAL_ICONS.has(name) && 'rtl:-scale-x-100', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {ICON_NODES[name].map(([Tag, attrs], index) => (
        <Tag key={index} {...attrs} />
      ))}
    </svg>
  );
}
