import { initPaymentSheet, initStripe, PaymentSheetError, presentPaymentSheet } from '@stripe/stripe-react-native';
import type { CheckoutAction, CreateDonationResponse } from '@yusr/core';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { RETURN_URL } from './api';

export type OfflineAction = Extract<CheckoutAction, { type: 'fawry_reference' | 'bank_transfer' }>;

export type CheckoutOutcome =
  /** Paid, still confirming, or the donor closed the gateway: the receipt screen shows which. */
  | { kind: 'receipt' }
  /** Pay later at a Fawry outlet or by InstaPay transfer: show the reference in the app. */
  | { kind: 'offline'; action: OfflineAction }
  /** The donor dismissed the payment sheet; nothing was charged and they can try again. */
  | { kind: 'canceled' };

const merchantCountry = String(Constants.expoConfig?.extra?.['stripeMerchantCountry'] ?? 'US');

/**
 * Runs the checkout step the API chose for this donation:
 *  - hosted gateways (Paymob, Moyasar) open in an in-app browser session that closes by itself
 *    when the gateway returns to yusr://receipt;
 *  - Stripe (USD) confirms its PaymentIntent in the native Payment Sheet (cards, Apple Pay);
 *  - Fawry and InstaPay settle later, so the reference is shown in the app.
 * The receipt screen then reads the authoritative status — the gateway's webhook decides, not the device.
 */
export async function runCheckout(created: CreateDonationResponse, merchantName: string): Promise<CheckoutOutcome> {
  const { action } = created;
  switch (action.type) {
    case 'redirect':
      await WebBrowser.openAuthSessionAsync(action.url, RETURN_URL);
      return { kind: 'receipt' };
    case 'stripe_client_secret': {
      await initStripe({ publishableKey: action.publishableKey, merchantIdentifier: 'merchant.org.yusr', urlScheme: 'yusr' });
      const setup = await initPaymentSheet({
        paymentIntentClientSecret: action.clientSecret,
        merchantDisplayName: merchantName,
        returnURL: 'yusr://stripe-redirect',
        applePay: { merchantCountryCode: merchantCountry },
        style: 'automatic',
      });
      if (setup.error) throw new Error(setup.error.message);
      const { error } = await presentPaymentSheet();
      if (error?.code === PaymentSheetError.Canceled) return { kind: 'canceled' };
      if (error) throw new Error(error.message);
      return { kind: 'receipt' };
    }
    case 'fawry_reference':
    case 'bank_transfer':
      return { kind: 'offline', action };
    case 'none':
      return { kind: 'receipt' };
  }
}
