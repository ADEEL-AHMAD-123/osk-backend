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
 * Which billing currencies each provider can actually charge.
 *
 *  - Stripe / PayPal: the major cards-supported set.
 *  - Paystack: NGN, GHS, ZAR, KES. The operator's Paystack account
 *    rejects USD, so we DON'T expose USD here. Plans priced in USD
 *    are handled by the FX-fallback path in resolveCheckoutPair —
 *    the seller's display stays USD, the checkout converts to the
 *    provider's first supported currency.
 *  - Bank transfer: a manual flow — trust the admin to accept
 *    whatever currency the wire arrives in.
 *
 * The frontend reads this map (re-exported via PaymentSettingsDTO).
 */
export const PROVIDER_BILLING_CURRENCIES: Record<
  ProviderKey,
  readonly BillingCurrency[]
> = {
  stripe: ['USD', 'CAD', 'EUR', 'GBP', 'AUD'],
  paypal: ['USD', 'CAD', 'EUR', 'GBP', 'AUD'],
  paystack: ['NGN', 'GHS', 'ZAR', 'KES'],
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
