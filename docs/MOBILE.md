# Mobile app

`apps/mobile` — one codebase for iOS and Android: Expo SDK 54, Expo Router, React Native 0.81
(new architecture), sharing the SDK, dictionaries, design tokens and icon set with the website.

## Screens

| Route | What it is |
|---|---|
| `(tabs)/index` | Home: regulator line, the promise, platform numbers, urgent cases rail, cases close to their goal |
| `(tabs)/explore` | Catalog: search, category and urgency filters, endless list |
| `(tabs)/donations` | «تبرعاتي»: receipts of donations made on this device, with live status |
| `(tabs)/profile` | Language, submit a case (opens the website), support, about |
| `case/[slug]` | The case: story, redacted documents, verification trail, where the money goes, donate |
| `receipt` | The receipt, reached from `yusr://receipt?donation=…&token=…` |

The donate sheet (`components/DonateSheet.tsx`) is the website's donate form in one native
screen: amount chips or a custom amount, intention (sadaqah / zakat / general), payment method,
covering the fee, anonymity, receipt contact, and a live total.

## Running it

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env      # EXPO_PUBLIC_API_URL: use your machine's LAN IP on a phone
pnpm --filter @yusr/api dev:memory                 # an API with demo data, no database needed
pnpm --filter @yusr/mobile ios                     # or: android · a development build (see below)
```

A **development build** (`expo run:ios` / `expo run:android`, or EAS) is required rather than
Expo Go, because the app uses Stripe's native Payment Sheet.

## Right-to-left

React Native applies the layout direction at start-up. The app stores the chosen language,
calls `I18nManager.forceRTL()` and reloads once when the direction changes (`lib/i18n.tsx`). Layout
uses `start` / `end` and `flexDirection: 'row'`, which flip automatically; text alignment is left
to the platform with `writingDirection` set per language (iOS and Android disagree on whether
`left` / `right` flip, so the app never sets them). Directional icons mirror in RTL.

## Payments

`lib/checkout.ts` runs whatever step the API chose:

| API action | In the app |
|---|---|
| `redirect` (Paymob, Moyasar) | `WebBrowser.openAuthSessionAsync(url, 'yusr://receipt')` — closes itself when the gateway returns |
| `stripe_client_secret` (USD) | Stripe Payment Sheet (cards, Apple Pay) |
| `fawry_reference`, `bank_transfer` | The reference / transfer details in the sheet, with copy buttons |

Every donation's id and receipt token are saved on the device (`lib/receipts.ts`), so a guest
donor can follow each gift under «تبرعاتي» without an account. The receipt screen re-reads the
status every few seconds while the gateway's webhook is in flight.

## Links

- `yusr://receipt?donation=…&token=…` — gateway returns.
- `https://yusr.org/{ar|en}/cases/{slug}` — Android App Links and iOS Universal Links open the case
  in the app (`app/+native-intent.tsx`). The website serves `/.well-known/assetlinks.json` and
  `/.well-known/apple-app-site-association` from `ANDROID_CERT_SHA256` and `APPLE_TEAM_ID`.

## Releasing

EAS Build and Submit with the `app.json` identifiers (`org.yusr.app`); `expo-updates` for
over-the-air JavaScript fixes between store releases. Before the first release: set the Stripe
merchant id and country, Apple Pay merchant capability, and the associated domain.
