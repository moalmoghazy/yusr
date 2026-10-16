import { DomainError } from '@yusr/core';
import type { CheckoutRequest, CheckoutResult, PaymentEvent, PaymentGateway, RefundCall, RefundResult } from '../gateway';

/**
 * InstaPay (Egypt's instant payment network) has no merchant API: the donor sends an
 * instant transfer to our payment address using the receipt number as the reference.
 * Finance matches the bank statement line and confirms the transfer
 * (POST /v1/admin/donations/:id/confirm-transfer), which posts the ledger entry.
 */
export interface InstapayConfig {
  /** Instant Payment Address, e.g. yusr@instapay. */
  ipa: string;
  accountName: string;
}

export class InstapayGateway implements PaymentGateway {
  readonly provider = 'instapay' as const;

  constructor(private readonly config: InstapayConfig) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (request.currency !== 'EGP') throw new DomainError('METHOD_NOT_AVAILABLE', 'InstaPay only moves EGP', { currency: request.currency });
    return {
      providerRef: request.reference,
      status: 'awaiting_transfer',
      action: {
        type: 'bank_transfer',
        ipa: this.config.ipa,
        accountName: this.config.accountName,
        reference: request.reference,
        expiresAt: request.expiresAt.toISOString(),
      },
    };
  }

  parseWebhook(): PaymentEvent {
    throw new DomainError('VALIDATION_FAILED', 'InstaPay transfers are confirmed by finance reconciliation, not webhooks');
  }

  /** Refunds go back by manual transfer; finance records the bank reference when done. */
  async refund(call: RefundCall): Promise<RefundResult> {
    return { providerRef: `manual:${call.reference}`, status: 'pending' };
  }
}
