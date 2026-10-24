# Brand — يُسر

> «فإنّ مع العسر يسرًا» — *with hardship comes ease.*

Yusr should feel **warm, trustworthy and calm**: a place where giving is simple and where every
figure can be checked. The identity is defined once in `packages/theme` and rendered from there
by the website, the control hub, the mobile app, receipts and the prototype.

## The mark — «الضمّة الذهبية» (the golden ḍamma)

The ḍamma is the small mark that turns يسر into **يُسر** — "ease". The logo holds it as **a golden drop**
above an open curve: the bowl of the letter **ي**, with its **two dots beneath it, solid, close
together and in the same colour as the curve**. Read another way, the curve is a pair of cupped
hands. A small gift, held carefully, that changes the meaning of someone's day.

| File | Use |
|---|---|
| `packages/theme/assets/logo-mark.svg` | The mark on light backgrounds |
| `packages/theme/assets/logo-mark-inverse.svg` | The mark on the primary colour or photos |
| `packages/theme/assets/logo-ar.svg`, `logo-en.svg` | Mark + name: the Arabic in the approved lettering, the Latin set in Reem Kufi |
| `packages/theme/assets/app-icon.svg` | 1024 × 1024 app icon (rendered to PNG for iOS / Android) |
| `packages/theme/assets/backgrounds/*.svg` | 1920 × 1200 screen backgrounds: emerald, light and dark |

- The geometry lives in `brand.ts` (`LOGO_VARIANTS`); `<LogoMark>` on the web and on mobile both
  draw from it, so there is one logo, not copies.
- **Small sizes**: below 20 px the two dots join into one short stroke (as ي is written by hand
  in Ruqʿa), so the mark stays legible in a tab or a notification.
- The mark's drop is `DROP_PATH` in `brand.ts`, its point turned up to the left.
- **Animated**: the website's «من نحن» page (`/about`) draws the mark live and replays on click;
  the ḍamma moves towards the pointer wherever it is on the page. In the website's header (Arabic)
  «يُسر» slides out of the mark, rests, and slides back in, every 7 s (`Logo animated`, `.logo-word`;
  still under reduced motion).
- **In the app**: the case covers loop like the website's (the mark appears, its ḍamma falls like a drop,
  it turns into the category's motif and back) and the home's pattern drifts behind the opening
  (`apps/mobile/src/lib/motion.ts`: one shared clock per loop, still under reduced motion).
- **Clear space**: at least the height of the ḍamma on every side. **Minimum size**: 16 px (mark),
  96 px wide (mark + wordmark).
- **Don't** recolour the ḍamma (it is always the highlight gold), outline the mark, rotate it, or
  place it on busy imagery without the inverse version.

### The name

The Arabic name «يُسر» beside the mark is **the approved lettering** of 2026-10-24 (`wordmark.ts`),
not set in a font: a classical, high-contrast Naskh, with pointed teeth on a level baseline, ر
sweeping out in a long hairline, the two dots of ي as joined diamonds, and the ḍamma in gold with
its counter open. It was traced from the approved artwork onto the mark's 64-unit grid in the place
it holds beside the mark, so word and mark always line up as approved. It needs no font, so it
looks the same everywhere. Don't re-set it in another face.

In Arabic the main page and section titles (every `h1`/`h2` with `font-display` on the web,
`display` and `heading` text on mobile) and the homepage's opening line «كُن سببًا في يُسر أحدهم
اليوم» are set in **Palestine** (`WORDMARK_FONT`, `typography.fonts.wordmark`, `--y-font-wordmark`,
`font-wordmark`), chosen by the owner on 2026-10-24. It has one weight, already heavy, so it is never
synthetically bolded. Its Latin letters and shadda are blank, and it shipped with a blank ḍamma: our copy draws the
ḍamma from the approved lettering's gold ḍamma, placed like its tanwīn (2026-10-24). Its medial and final letters also
reach 12 units past their advance, so joined letters overlap instead of only touching, which left a hairline seam. Because of the blanks, the web limits it to Arabic and
digits (`unicode-range`) so Latin falls back to IBM Plex Sans Arabic, and English titles keep the
heading face. Exceptions stay in the heading face (bold IBM Plex Sans Arabic): the homepage's «من
الطلب حتى إثبات الصرف» and case titles (`title-plain` on the web; the case screen on mobile). The web self-hosts it (`apps/web/src/fonts`), mobile bundles it
(`apps/mobile/assets/fonts`). Amiri is the fallback where it isn't shipped (the prototype).

«Yusr» (and «يُسر» when `brand.wordmark = 'typeset'`) is set in **Reem Kufi**, the *logo face*
(`typography.fonts.logo`, `--y-font-logo`, `font-logo`), kept apart from the heading face so
headings can change without touching the logo. The mark leads in the reading direction: right of
the Arabic name, left of the Latin one.

### Screen backgrounds

`logoBackgroundSvg({ tone })` draws a 1920 × 1200 background (any size): the lockup centred on a
soft glow, with «روضة العطاء» coming in towards the edges and clearing behind the logo. Three
tones — `brand` (white on emerald), `light`, `dark` — follow the theme, so a rebrand repaints
them. The name is drawn (no font needed), so the SVG exports to a PNG anywhere for a wallpaper, an
event screen or a video call.

## Colour

Every text / background pair the components render is checked by `packages/theme/test` —
body text on page surfaces at 7:1 (WCAG AAA), everything else at 4.5:1 (AA) — for the default
theme and for any theme derived from brand colours.

| Token | Light | Dark | Role |
|---|---|---|---|
| `primary` | `#13725F` | `#3DBA99` | Brand emerald: actions, links, progress |
| `primary-hover` | `#0F5B4D` | `#5ACBAD` | Pressed / hover |
| `highlight` | `#E0A42F` | `#E9B75A` | The golden ḍamma: the logo drop, milestones, "funded" |
| `background` | `#F4F7F6` | `#0A1311` | Page |
| `card` | `#FFFFFF` | `#101C19` | Surfaces |
| `foreground` | `#10201C` | `#E6EFEC` | Text |
| `muted-foreground` | `#55645F` | `#98ABA5` | Secondary text |
| `destructive` | `#C8323A` | `#F06B70` | Errors, critical deadlines |
| `success` | `#1E7A48` | `#5CCB8C` | Paid, verified |

Category tones give each kind of need its own colour, used on covers, badges and charts:
medical — rose `#E5484D`, debt relief — slate `#556C9D`, education — sky `#2A86D6`, orphans'
care — gold `#C98A1B`, urgent relief — teal `#1F8C74` (each with a soft background and an
accessible foreground, in both schemes).

## Type

| Face | Use |
|---|---|
| **Reem Kufi** | The logo face: «Yusr» beside the mark, and nothing else |
| **Palestine** | Arabic main titles and the homepage's opening line |
| **KAF FODA digits** | The numbers in the home's stats band, in Arabic (`apps/web/src/fonts/kaf-foda-digits.ttf`: only its ٠–٩, from the face «يُسر» is drawn in; personal-use licence, published on the owner's call) |
| **IBM Plex Sans Arabic** | Everything else, Arabic and Latin (it carries both); in **bold** for headings — hero titles, section titles, big numbers |
| **IBM Plex Mono** | Case references, receipt numbers, code |

Scale (px): 12 · 14 · 16 · 18 · 21 · 25 · 31 · 39 · 50. Arabic body text uses a line height of
1.8 (Latin 1.6); Arabic headings at least 1.4 (Arabic needs room for its dots and marks above and
below the line), the Arabic hero 1.45 (Latin 1.15). Numbers use Arabic-Indic digits in Arabic (١٢٣) and are tabular where
they line up.

**Switching the heading face.** Headings use the text family's bold (`DISPLAY_FACES.plexArabic`,
the default), chosen over Cairo, Tajawal, Noto Kufi Arabic, Changa, Almarai and Lemonada for
legibility. Those stay in `DISPLAY_FACES` (`tokens.ts`) — all free (OFL) on Google Fonts, all
compared live in the prototype's theming playground.
`withDisplayFace(theme, 'cairo')` updates the CSS stack, the web-font link and the native font
name together. The apps load fonts by name, so also change:

- the website: the `next/font/google` import in `apps/web/src/app/[locale]/layout.tsx` and the
  variable in `apps/web/src/app/globals.css`;
- the app: the `@expo-google-fonts/*` package in `apps/mobile/package.json` and the font in
  `apps/mobile/src/app/_layout.tsx`.

## The pattern — «روضة العطاء» (the garden of giving)

Andalusian geometry: the eight-pointed star of the Alhambra's tilework (two squares — the
*khatam*), joined to its neighbours by strapwork that draws octagonal cells between the stars.
Inside each star, a rosette of **seven golden drops** — the ḍamma of the logo, repeated once for each
of the verse's seven ears: a single gift that multiplies, *"like a grain that sprouts seven ears."* Where four tiles meet, a small
lozenge holds one seed.

- Computed from one number (the tile size, 144 px) in `pattern.ts`, so it repeats seamlessly;
  exported as `pattern.svg`, `pattern-dark.svg` and a CSS variable (`--y-pattern`) per scheme.
- Always quiet: the lattice at ~14 % opacity in the brand colour, the drops at ~25 % in gold.
- Use it for hero backgrounds, empty states and the submit banner; fade it out under text.
  On small surfaces (case covers, thumbnails) use the lattice without rosettes.

## Imagery

**No photos of beneficiaries — ever.** Each case gets an illustrated cover: its category's motif
on the brand lattice, with the golden drop, composed from the case's seed so neighbouring cards
differ. Dignity is part of the brand.

Icons: 24 px grid, 1.8 px round strokes, `currentColor`; arrows and other directional icons
mirror in right-to-left layouts.

## Writing

- Arabic first (Modern Standard, warm and plain); English is a full translation, not a summary.
- Say what happens to the money: *"paid directly to the hospital"*, not *"your donation helps"*.
- Name people by pseudonym («أم أحمد»); never write details that identify a family.
- Numbers are exact and honest: a case short of its goal never shows 100 %, one with any
  donation never shows 0 %.

## Regulator line (Ministry of Social Solidarity)

Above the hero's eyebrow on the website and the app's home screen: the ministry's logo on a
**white, rounded tile** (its artwork is drawn for white, so the tile keeps it legible in dark
mode), and beside it «هذه المنصة تحت إشراف / وزارة التضامن الاجتماعي المصرية» in the eyebrow's
type — the ministry's name on its own line.

- Show it only once the operating association is registered with the ministry and has
  permission to use the logo. It can be switched off (`NEXT_PUBLIC_SHOW_SUPERVISION=false` on the
  website, `extra.showSupervision` in the app) until then.
- Add the registration number (`NEXT_PUBLIC_MOSS_REGISTRATION_NUMBER`, «مشهرة برقم …») so any
  donor can check it.
- Never recolour, crop or redraw the ministry's logo; the file is
  `packages/theme/assets/partners/moss-egypt.png`.

## Changing the brand

Everything above is data. To rebrand (a partner's white-label, a campaign):

```ts
import { createTheme, themeFromBrandColors, withDisplayFace } from '@yusr/theme';

// Two colours in, a complete accessible light + dark theme out
// (the primary is darkened automatically if white text on it would fail AA).
const partner = themeFromBrandColors({ name: 'partner', primary: '#1D5FA7', highlight: '#F2B134' });

// Or adjust any token by hand, and switch the heading face in one call.
const campaign = createTheme({ radius: { card: 24 } });
const clearer = withDisplayFace(campaign, 'cairo');
```

`pnpm --filter @yusr/theme build` regenerates `tokens.css`, `tailwind.css`, the SVG assets, the
pattern files and the screen backgrounds; the apps pick them up on their next build.
