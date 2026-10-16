import { DomainError } from '@yusr/core';
import { safeEqual, sha256Hex } from '../../common/crypto';
import {
  majorToMinor,
  minorToMajorString,
  type CheckoutRequest,
  type CheckoutResult,
  type FetchLike,
  type PaymentEvent,
  type PaymentGateway,
  type PaymentOutcome,
  type RefundCall,
  type RefundResult,
  type WebhookInput,
} from '../gateway';
import { callJson, parseJsonBody } from '../http';

/**
 * Fawry (Egypt) "Pay at Fawry": the donor gets a reference number and pays cash at
 * any of Fawry's outlets or in a banking app. Fawry notifies us (server notification V2)
 * when the reference is paid or expires.
 *
 * Docs: https://developer.fawrystaging.com — "Charge request (PAYATFAWRY)", "Server notification V2", "Refund".
 */
export interface FawryConfig {
  baseUrl: string;
  merchantCode: string;
  secureKey: string;
}

interface ChargeResponse {
  type?: string;
  referenceNumber?: string | number;
  merchantRefNumber?: string;
  expirationTime?: number;
  statusCode: number;
  statusDescription?: string;
}

const STATUS: Readonly<Record<string, PaymentOutcome>> = {
  PAID: 'succeeded',
  NEW: 'pending',
  UNPAID: 'pending',
  EXPIRED: 'expired',
  CANCELED: 'failed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

/** +201001234567 → 01001234567 (the local format Fawry expects). */
export function egyptianMobile(phone: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('20') && digits.length === 12) return `0${digits.slice(2)}`;
  return digits.length === 11 && digits.startsWith('01') ? digits : undefined;
}

export class FawryGateway implements PaymentGateway {
  readonly provider = 'fawry' as const;
  private readonly baseUrl: string;

  constructor(
    private readonly config: FawryConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  /** SHA-256 of merchantCode + merchantRefNum + customerProfileId + paymentMethod + amount + secureKey. */
  chargeSignature(reference: string, amount: string, customerProfileId = ''): string {
    const { merchantCode, secureKey } = this.config;
    return sha256Hex(`${merchantCode}${reference}${customerProfileId}PAYATFAWRY${amount}${secureKey}`);
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (request.currency !== 'EGP') throw new DomainError('METHOD_NOT_AVAILABLE', 'Fawry only accepts EGP', { currency: request.currency });
    const amount = minorToMajorString(request.amountMinor);
    const response = await callJson<ChargeResponse>(this.fetchImpl, 'fawry', `${this.baseUrl}/ECommerceWeb/Fawry/payments/charge`, {
      body: {
        merchantCode: this.config.merchantCode,
        merchantRefNum: request.reference,
        customerName: request.customer.name ?? undefined,
        customerMobile: egyptianMobile(request.customer.phone),
        customerEmail: request.customer.email ?? undefined,
        paymentMethod: 'PAYATFAWRY',
        amount,
        currencyCode: 'EGP',
        language: request.locale === 'ar' ? 'ar-eg' : 'en-gb',
        description: request.description,
        paymentExpiry: request.expiresAt.getTime(),
        chargeItems: [{ itemId: request.donationId, description: request.description, price: amount, quantity: 1 }],
        signature: this.chargeSignature(request.reference, amount),
      },
    });
    if (response.statusCode !== 200 || response.referenceNumber === undefined) {
      throw new DomainError('PAYMENT_PROVIDER_ERROR', `Fawry charge failed: ${response.statusDescription ?? response.statusCode}`, {
        provider: 'fawry',
        statusCode: response.statusCode,
      });
    }
    const referenceNumber = String(response.referenceNumber);
    return {
      providerRef: referenceNumber,
      status: 'awaiting_transfer',
      action: {
        type: 'fawry_reference',
        referenceNumber,
        expiresAt: new Date(response.expirationTime ?? request.expiresAt.getTime()).toISOString(),
      },
    };
  }

  /**
   * messageSignature = SHA-256 of fawryRefNumber + merchantRefNumber + paymentAmount + orderAmount
   * + orderStatus + paymentMethod + paymentRefrenceNumber (sic, when present) + secureKey.
   */
  notificationSignature(body: Record<string, unknown>): string {
    const amount = (value: unknown) => (value === undefined || value === null || value === '' ? '' : minorToMajorString(majorToMinor(String(value))));
    return sha256Hex(
      [
        body['fawryRefNumber'] ?? '',
        body['merchantRefNumber'] ?? '',
        amount(body['paymentAmount']),
        amount(body['orderAmount']),
        body['orderStatus'] ?? '',
        body['paymentMethod'] ?? '',
        body['paymentRefrenceNumber'] ?? '',
        this.config.secureKey,
      ].join(''),
    );
  }

  parseWebhook(input: WebhookInput): PaymentEvent {
    const body = parseJsonBody(input.rawBody, 'fawry');
    const received = String(body['messageSignature'] ?? '').toLowerCase();
    if (!received || !safeEqual(this.notificationSignature(body), received)) {
      throw new DomainError('INVALID_SIGNATURE', 'Fawry messageSignature mismatch');
    }
    const status = String(body['orderStatus'] ?? '').toUpperCase();
    const outcome = STATUS[status] ?? 'pending';
    const paid = body['paymentAmount'] ?? body['orderAmount'];
    return {
      provider: 'fawry',
      eventId: `${String(body['fawryRefNumber'])}:${status}`,
      reference: String(body['merchantRefNumber'] ?? ''),
      providerRef: String(body['fawryRefNumber'] ?? ''),
      outcome,
      amountMinor: majorToMinor(String(paid ?? '0')),
      currency: 'EGP',
      feeMinor: body['fawryFees'] === undefined || body['fawryFees'] === null ? null : majorToMinor(String(body['fawryFees'])),
      failureCode: outcome === 'failed' ? String(body['failureErrorCode'] ?? status) : null,
      payload: body,
    };
  }

  async refund(call: RefundCall): Promise<RefundResult> {
    const refundAmount = minorToMajorString(call.amountMinor);
    const reason = call.reason.slice(0, 100);
    const signature = sha256Hex(`${this.config.merchantCode}${call.providerRef}${refundAmount}${reason}${this.config.secureKey}`);
    const response = await callJson<{ statusCode: number; statusDescription?: string }>(
      this.fetchImpl,
      'fawry',
      `${this.baseUrl}/ECommerceWeb/Fawry/payments/refund`,
      { body: { merchantCode: this.config.merchantCode, referenceNumber: call.providerRef, refundAmount, reason, signature } },
    );
    if (response.statusCode !== 200) {
      throw new DomainError('PAYMENT_PROVIDER_ERROR', `Fawry refund failed: ${response.statusDescription ?? response.statusCode}`);
    }
    return { providerRef: call.providerRef, status: 'processed' };
  }
}
