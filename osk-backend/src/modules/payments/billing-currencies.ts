import type { ProviderKey } from './payment.types';

/**
 * Real billing currencies the platform actually charges in. The admin
 * editor restricts plan prices to this set, so every saved plan price
 * is guaranteed to be chargeable by at least one provider.
 *
 * Keep this short on purpose — wider FX coverage means more checkout
 * reconciliation overhead. Display localisation happens in the
 * frontend via a static FX table, not by adding entries here.
 */
export const BILLING_CURRENCIES = [
  'USD',
  'CAD',
  'EUR',
  'GBP',
  'AUD',
  'NGN',
  'GHS',
  'ZAR',
  'KES',
] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

/**
 * Which billing currencies each provider can accept at checkout.
 *
 *  - Stripe / PayPal: stick to the major cards-supported set. Both
 *    accept many more currencies in practice; the list here is the
 *    safe subset we're willing to expose without per-region testing.
 *  - Paystack: NGN, GHS, ZAR, USD, KES. The operator confirmed NGN
 *    and GHS work; the rest are documented as supported.
 *  - Bank transfer: a manual flow, so we trust the admin to actually
 *    accept whatever currency the wire arrives in. All of them.
 *
 * The frontend reads this map (re-exported via PaymentSettingsDTO) so
 * the provider picker can be driven purely from the API and we never
 * surface an impossible provider/currency pair to the seller.
 */
export const PROVIDER_BILLING_CURRENCIES: Record<
  ProviderKey,
  readonly BillingCurrency[]
> = {
  stripe: ['USD', 'CAD', 'EUR', 'GBP', 'AUD'],
  paypal: ['USD', 'CAD', 'EUR', 'GBP', 'AUD'],
  paystack: ['NGN', 'GHS', 'ZAR', 'USD', 'KES'],
  'bank-transfer': [
    'USD',
    'CAD',
    'EUR',
    'GBP',
    'AUD',
    'NGN',
    'GHS',
    'ZAR',
    'KES',
  ],
};

/** True when `currency` is one of the platform's billing currencies. */
export function isBillingCurrency(currency: string): currency is BillingCurrency {
  return (BILLING_CURRENCIES as readonly string[]).includes(
    currency.toUpperCase(),
  );
}

/** True when `provider` can charge in `currency`. */
export function providerSupportsCurrency(
  provider: ProviderKey,
  currency: string,
): boolean {
  return (PROVIDER_BILLING_CURRENCIES[provider] as readonly string[]).includes(
    currency.toUpperCase(),
  );
}
