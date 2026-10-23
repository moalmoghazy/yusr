import { brand } from '@yusr/theme';
import { PLATFORM_GLYPHS } from '@yusr/ui';
import type { CSSProperties } from 'react';

const GLYPH = PLATFORM_GLYPHS.whatsapp;
const DROP = brand.logo.drop;

/**
 * A floating button on every page that opens a WhatsApp chat with Yusr's number (site.whatsapp).
 * At rest it is drawn in the site's own style: a line bubble and handset on the brand green, with the
 * golden ḍamma above. On hover (or focus) it turns into WhatsApp's real green and glyph, and its label
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
      className="wa-button group fixed bottom-5 end-5 z-40 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-[background-color,transform] duration-300 hover:scale-105 hover:bg-[var(--wa-brand)] focus-visible:bg-[var(--wa-brand)] focus-visible:ring-[3px] focus-visible:ring-ring/60 print:hidden"
    >
      {/* Yusr's version: line icons at the site's stroke, and the golden ḍamma. */}
      <svg
        viewBox="0 0 24 24"
        width={30}
        height={30}
        aria-hidden
        focusable="false"
        className="col-start-1 row-start-1 transition-[opacity,transform] duration-300 group-hover:scale-75 group-hover:opacity-0 group-focus-visible:opacity-0"
      >
        <g fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2.6 21.4Z" />
          <path d="M15.6 14.1v1.4a1 1 0 0 1-1.1 1 9.6 9.6 0 0 1-7.1-7 1 1 0 0 1 1-1.1h1.4a1 1 0 0 1 1 .8l.3 1.1a1 1 0 0 1-.3 1l-.5.5a7 7 0 0 0 2.8 2.8l.5-.5a1 1 0 0 1 1-.3l1.1.3a1 1 0 0 1 .9 1Z" />
        </g>
        <path d={DROP.d} transform={`translate(11.9 -0.4) scale(0.24) ${DROP.transform}`} className="fill-highlight" />
      </svg>
      {/* WhatsApp's own glyph, shown on hover. */}
      <svg
        viewBox="0 0 24 24"
        width={30}
        height={30}
        fill="currentColor"
        aria-hidden
        focusable="false"
        className="col-start-1 row-start-1 scale-75 text-[var(--wa-on-brand)] opacity-0 transition-[opacity,transform] duration-300 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
      >
        <path d={GLYPH.d} />
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
