import type { CSSProperties } from 'react';
import { cn } from './cn';

/**
 * Simplified marks of the payment services Yusr accepts, drawn on a 24-unit grid. Each is one or more
 * shapes with the service's own colour: at rest they take Yusr's turquoise (currentColor); when the
 * surrounding `group` is hovered or focused, each shape takes its brand colour.
 *
 * These are simplified drawings, not the services' official artwork: swap in the official SVGs from each
 * provider's brand kit before launch (keep the 24-unit viewBox).
 */
export const PAYMENT_MARKS = {
  // Vodafone's speech mark: a red disc with a white quotation-mark drop.
  vodafone_cash: [
    {
      d: 'M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm.9 5.1c.9-.3 2-.3 2.9 0-1.1.5-1.9 1.6-2 2.8 2.6.4 4.4 2.3 4.4 4.9 0 2.9-2.3 5.4-5.3 5.4-3.3 0-5.5-2.9-5.5-6.2 0-3.7 2.5-6.4 5.5-6.9Z',
      color: '#E60000',
    },
  ],
  // InstaPay: a purple tile with a forward-moving arrow and the «i».
  instapay: [
    { d: 'M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z', color: '#4D1C7A' },
    { d: 'M7 7.2h2.4v9.6H7zM8.2 3.9a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Z', color: '#FFFFFF', knockout: true },
    { d: 'M11.2 8.2h3.6l3.6 3.8-3.6 3.8h-3.6l3.6-3.8z', color: '#F7941D', knockout: true },
  ],
  // Apple (Simple Icons, CC0).
  apple_pay: [
    {
      d: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701',
      color: 'var(--foreground)',
    },
  ],
  // mada: its two stacked bars, blue over green.
  mada: [
    { d: 'M2 6.5h20v4.5H2z', color: '#259BD6' },
    { d: 'M2 13h20v4.5H2z', color: '#84B740' },
  ],
  // Paymob: a blue rounded «p».
  paymob: [
    {
      d: 'M6 3h7a6 6 0 0 1 0 12h-3.4v5.2a.8.8 0 0 1-.8.8H6.8a.8.8 0 0 1-.8-.8Zm3.6 3.6v4.8H13a2.4 2.4 0 0 0 0-4.8Z',
      color: '#0F5CFF',
    },
  ],
} as const satisfies Record<string, ReadonlyArray<{ d: string; color: string; knockout?: boolean }>>;

export type PaymentMarkName = keyof typeof PAYMENT_MARKS;

/**
 * A payment service's mark. Shapes marked `knockout` sit on another shape: at rest they are cut out
 * (the card's own background), and they take their colour on hover. Decorative: the label beside it names it.
 */
export function PaymentMark({ name, size = 18, className }: { name: PaymentMarkName; size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} focusable="false" className={cn('shrink-0 text-primary', className)}>
      {PAYMENT_MARKS[name].map((part, index) => (
        <path
          key={index}
          d={part.d}
          fillRule="evenodd"
          style={{ '--mark': part.color } as CSSProperties}
          className={cn(
            'transition-[fill] duration-200 group-hover:[fill:var(--mark)] group-focus-visible:[fill:var(--mark)]',
            'knockout' in part && part.knockout ? 'fill-card' : 'fill-current',
          )}
        />
      ))}
    </svg>
  );
}
