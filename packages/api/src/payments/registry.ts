import { DomainError, type PaymentProvider } from '@yusr/core';
import type { PaymentGateway } from './gateway';

/** The configured gateways, looked up by provider (routing lives in @yusr/core PAYMENT_ROUTES). */
export class GatewayRegistry {
  private readonly byProvider: ReadonlyMap<PaymentProvider, PaymentGateway>;

  constructor(gateways: readonly PaymentGateway[]) {
    this.byProvider = new Map(gateways.map((gateway) => [gateway.provider, gateway]));
  }

  get(provider: PaymentProvider): PaymentGateway {
    const gateway = this.byProvider.get(provider);
    if (!gateway) throw new DomainError('METHOD_NOT_AVAILABLE', `${provider} is not configured`, { provider });
    return gateway;
  }

  has(provider: PaymentProvider): boolean {
    return this.byProvider.has(provider);
  }

  providers(): PaymentProvider[] {
    return [...this.byProvider.keys()];
  }
}
