import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition-colors outline-none select-none ' +
  'focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

const VARIANTS = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
  soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/75',
  outline: 'border border-border bg-card text-foreground hover:border-border-strong hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  gold: 'bg-highlight text-highlight-foreground shadow-sm hover:bg-highlight/90',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
} as const;

const SIZES = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-12 px-6 text-base',
  icon: 'size-10',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export interface ButtonStyle {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}

/** Button classes for any element — a <button>, a Next.js <Link>, an <a>. */
export function buttonClasses({ variant = 'primary', size = 'md', block, className }: ButtonStyle = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<ButtonStyle, 'className'> {}

export function Button({ variant, size, block, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, block, className })} {...props} />;
}
