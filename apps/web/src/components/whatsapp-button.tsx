import { PLATFORM_GLYPHS } from '@yusr/ui';
import type { CSSProperties } from 'react';

const GLYPH = PLATFORM_GLYPHS.whatsapp;

/** A floating button on every page that opens a WhatsApp chat with Yusr's number (site.whatsapp); hovering it shows its label beside it. */
export function WhatsAppButton({ number, label }: { number: string; label: string }) {
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      style={{ '--wa-brand': GLYPH.brand, '--wa-on-brand': GLYPH.onBrand } as CSSProperties}
      className="group fixed bottom-5 end-5 z-40 grid size-14 place-items-center rounded-full bg-[var(--wa-brand)] text-[var(--wa-on-brand)] shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/60 print:hidden"
    >
      <svg viewBox="0 0 24 24" width={30} height={30} fill="currentColor" aria-hidden focusable="false">
        <path d={GLYPH.d} />
      </svg>
      <span
        aria-hidden
        className="pointer-events-none absolute end-full top-1/2 me-3 -translate-y-1/2 scale-95 whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground opacity-0 shadow-md transition duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </a>
  );
}
