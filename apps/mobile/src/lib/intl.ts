/**
 * Hermes ships Intl.NumberFormat and DateTimeFormat but not every API @yusr/i18n uses.
 * Polyfill only what is missing, for the two locales the app speaks. Imported first in the root layout.
 */
import { shouldPolyfill as needsCanonical } from '@formatjs/intl-getcanonicallocales/should-polyfill';
import { shouldPolyfill as needsLocale } from '@formatjs/intl-locale/should-polyfill';
import { shouldPolyfill as needsPlural } from '@formatjs/intl-pluralrules/should-polyfill';
import { shouldPolyfill as needsRelative } from '@formatjs/intl-relativetimeformat/should-polyfill';

if (needsCanonical()) require('@formatjs/intl-getcanonicallocales/polyfill');
if (needsLocale()) require('@formatjs/intl-locale/polyfill');
if (needsPlural('ar')) {
  require('@formatjs/intl-pluralrules/polyfill-force');
  require('@formatjs/intl-pluralrules/locale-data/ar');
  require('@formatjs/intl-pluralrules/locale-data/en');
}
if (needsRelative('ar')) {
  require('@formatjs/intl-relativetimeformat/polyfill-force');
  require('@formatjs/intl-relativetimeformat/locale-data/ar');
  require('@formatjs/intl-relativetimeformat/locale-data/en');
}
