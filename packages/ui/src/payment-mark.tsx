import type { CSSProperties } from 'react';
import { cn } from './cn';

interface MarkPart {
  d: string;
  /** The brand colour this shape takes on hover. */
  color: string;
  /** Sits on another shape: at rest it is cut out (the card's background), on hover it takes its colour. */
  knockout?: boolean;
}

interface Mark {
  viewBox: string;
  parts: ReadonlyArray<MarkPart>;
}

/**
 * Marks of the payment services Yusr accepts. Each is one or more shapes with the service's own colour:
 * at rest they take Yusr's turquoise (currentColor); when the surrounding `group` is hovered or focused,
 * each shape takes its brand colour.
 *
 * Vodafone and InstaPay are traced from the logos the owner supplied (2026-11-16); Apple is from Simple
 * Icons (CC0); mada, Paymob and Fawry are simplified drawings. Before launch, replace them with the
 * official SVGs from each provider's brand kit.
 */
export const PAYMENT_MARKS = {
  // Vodafone: the red disc with the white speech mark.
  vodafone_cash: {
    viewBox: '0 0 512 512',
    parts: [
      { d: 'M256 0a256 256 0 1 1 0 512 256 256 0 0 1 0-512Z', color: '#E60000' },
      {
        d: 'M365 22C298 20 228 42 178 90c-44 43-63 97-63 156 0 92 64 165 141 165 76 0 134-64 134-143 0-69-42-118-107-133-5-57 30-104 82-113Z',
        color: '#FFFFFF',
        knockout: true,
      },
    ],
  },
  // InstaPay: the slanted purple «i», a salmon and an orange chevron, and the purple «P».
  instapay: {
    viewBox: '0 0 34 20',
    parts: [
      { d: 'M3.6.8h3.6l-.9 3.6H2.7zM2.4 6h3.6L3.3 19H-.3Z', color: '#5B2A86' },
      { d: 'M7.6 6h4.3l4.6 6.5-4.6 6.5H7.6l4.6-6.5Z', color: '#F47C6A' },
      { d: 'M13.5 6h4.3l4.6 6.5-4.6 6.5h-4.3l4.6-6.5Z', color: '#F7941D' },
      { d: 'M23.6 6h6.2a5.1 5.1 0 0 1 0 10.2h-2.6V19h-3.6Zm3.6 3.2v3.8h2.4a1.9 1.9 0 0 0 0-3.8Z', color: '#6A2C91' },
    ],
  },
  // Fawry: a yellow tile with a blue «f».
  fawry: {
    viewBox: '0 0 24 24',
    parts: [
      { d: 'M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z', color: '#FFD100' },
      {
        d: 'M10.2 19V11H8.4V8.6h1.8V7.8c0-2.4 1.3-3.8 3.9-3.8.8 0 1.5.1 2 .3l-.4 2.4a3 3 0 0 0-1.2-.2c-.9 0-1.3.5-1.3 1.4v.7h2.4V11h-2.4v8Z',
        color: '#005CA9',
        knockout: true,
      },
    ],
  },
  // Apple (Simple Icons, CC0).
  apple_pay: {
    viewBox: '0 0 24 24',
    parts: [
      {
        d: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701',
        color: 'var(--foreground)',
      },
    ],
  },
  // mada: its two stacked bars, blue over green.
  mada: {
    viewBox: '0 0 24 24',
    parts: [
      { d: 'M2 6.5h20v4.5H2z', color: '#259BD6' },
      { d: 'M2 13h20v4.5H2z', color: '#84B740' },
    ],
  },
  // Paymob: a blue rounded «p».
  paymob: {
    viewBox: '0 0 24 24',
    parts: [
      {
        d: 'M6 3h7a6 6 0 0 1 0 12h-3.4v5.2a.8.8 0 0 1-.8.8H6.8a.8.8 0 0 1-.8-.8Zm3.6 3.6v4.8H13a2.4 2.4 0 0 0 0-4.8Z',
        color: '#0F5CFF',
      },
    ],
  },
} as const satisfies Record<string, Mark>;

export type PaymentMarkName = keyof typeof PAYMENT_MARKS;

/** A payment service's mark, `size` px tall (wide marks keep their proportions). Decorative: the label beside it names it. */
export function PaymentMark({ name, size = 18, className }: { name: PaymentMarkName; size?: number; className?: string }) {
  const mark: Mark = PAYMENT_MARKS[name];
  const [, , w, h] = mark.viewBox.split(' ').map(Number);
  return (
    <svg
      aria-hidden
      viewBox={mark.viewBox}
      width={Math.round((size * w!) / h!)}
      height={size}
      focusable="false"
      className={cn('shrink-0 overflow-visible text-primary', className)}
    >
      {mark.parts.map((part, index) => (
        <path
          key={index}
          d={part.d}
          fillRule="evenodd"
          style={{ '--mark': part.color } as CSSProperties}
          className={cn(
            'transition-[fill] duration-200 group-hover:[fill:var(--mark)] group-focus-visible:[fill:var(--mark)]',
            part.knockout ? 'fill-card' : 'fill-current',
          )}
        />
      ))}
    </svg>
  );
}
