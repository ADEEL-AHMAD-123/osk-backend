import type { ProviderKey } from '../payment.types';
import type { PaymentProvider } from './provider.interface';
import { stripeProvider } from './stripe.provider';
import { paypalProvider } from './paypal.provider';
import { paystackProvider } from './paystack.provider';
import { bankTransferProvider } from './bankTransfer.provider';

/** Provider registry — index lookups by key (used by service + webhook routing). */
const REGISTRY: Record<ProviderKey, PaymentProvider> = {
  stripe: stripeProvider,
  paypal: paypalProvider,
  paystack: paystackProvider,
  'bank-transfer': bankTransferProvider,
};

export function getProvider(key: ProviderKey): PaymentProvider {
  const p = REGISTRY[key];
  if (!p) throw new Error(`Unknown payment provider: ${key}`);
  return p;
}

export function listProviders(): PaymentProvider[] {
  return Object.values(REGISTRY);
}

export { stripeProvider, paypalProvider, paystackProvider, bankTransferProvider };
export type { PaymentProvider };
