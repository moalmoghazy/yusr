import { brand } from '@yusr/theme';
import { PLATFORM_GLYPHS } from '@yusr/ui';
import type { CSSProperties } from 'react';

const GLYPH = PLATFORM_GLYPHS.whatsapp;
const DROP = brand.logo.drop;

/**
 * A floating button on every page that opens a WhatsApp chat with Yusr's number (site.whatsapp).
 * At rest it wears the site's colours: WhatsApp's glyph in white on the brand green, a gold ring and the
 * golden ḍamma. On hover (or focus) it turns WhatsApp's real green, and its label
 * appears beside it, circled by a glowing gold line (`.wa-*` in globals.css).
 */
export function WhatsAppButton({ number, label }: { number: string; label: string }) {
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      style={{ '--wa-brand': GLYPH.brand, '--wa-on-brand': GLYPH.onBrand } as CSSProperties}
      className="wa-button group fixed bottom-5 end-5 z-40 grid size-14 place-items-center rounded-full bg-primary shadow-lg ring-2 ring-highlight/70 outline-none transition-[background-color,transform] duration-300 hover:scale-105 hover:bg-[var(--wa-brand)] focus-visible:bg-[var(--wa-brand)] focus-visible:ring-[3px] focus-visible:ring-ring/60 print:hidden"
    >
      <svg
        viewBox="0 0 24 24"
        width={28}
        height={28}
        fill="currentColor"
        aria-hidden
        focusable="false"
        className="text-primary-foreground transition-colors duration-300 group-hover:text-[var(--wa-on-brand)] group-focus-visible:text-[var(--wa-on-brand)]"
      >
        <path d={GLYPH.d} />
      </svg>
      {/* The golden ḍamma, Yusr's touch on the button; it lifts away when WhatsApp's own colours take over. */}
      <svg
        viewBox="22 4 26 26"
        aria-hidden
        focusable="false"
        className="absolute -top-1 -end-1 size-5 drop-shadow transition-[opacity,transform] duration-300 group-hover:-translate-y-1 group-hover:opacity-0 group-focus-visible:opacity-0"
      >
        <path d={DROP.d} transform={DROP.transform} className="fill-highlight" />
      </svg>
      <span
        aria-hidden
        className="wa-label pointer-events-none absolute end-full top-1/2 me-3 -translate-y-1/2 scale-95 whitespace-nowrap rounded-full bg-card px-4 py-2 text-sm font-semibold text-foreground opacity-0 shadow-md transition duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </a>
  );
}
