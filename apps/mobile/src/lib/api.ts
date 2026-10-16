import type { Locale } from '@yusr/core';
import { createHttpClient, type YusrClient } from '@yusr/sdk';
import { brand } from '@yusr/theme';
import Constants from 'expo-constants';

const baseUrl = String(process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.['apiUrl'] ?? 'http://localhost:4000/v1');

const clients = new Map<Locale, YusrClient>();

/** The same typed client as the website; the API answers in the app's language. */
export function api(locale: Locale): YusrClient {
  let client = clients.get(locale);
  if (!client) {
    client = createHttpClient({ baseUrl, locale, timeoutMs: 20_000 });
    clients.set(locale, client);
  }
  return client;
}

/** Where gateways send the donor back: the app's own scheme (the API only accepts allowed targets). */
export const RETURN_URL = 'yusr://receipt';

export const showSupervision = Constants.expoConfig?.extra?.['showSupervision'] !== false;

/** The website, for what the app hands over to it (submitting a case, legal pages). */
export const WEB_URL = String(process.env.EXPO_PUBLIC_WEB_URL ?? Constants.expoConfig?.extra?.['webUrl'] ?? brand.contact.website).replace(/\/$/, '');
