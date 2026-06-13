/**
 * Pricing domain types — shared by model, service, controller, mappers.
 *
 * After moving to a subscription model, this module is no longer about
 * per-listing pricing plans. It's now purely the operator's payment
 * configuration: the global enabled toggle, the list of enabled
 * providers, encrypted provider credentials, and the bank-transfer
 * instructions surface.
 *
 * Per-listing plans (PricingPlan + the resolver) have been removed.
 * Subscription plans live in `modules/subscriptions/` instead.
 */

export const PROVIDER_KEYS = [
  'stripe',
  'paypal',
  'paystack',
  'bank-transfer',
] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

/**
 * Per-field credential status returned to the admin. We NEVER ship the
 * raw secret back — only a "configured" flag plus a masked hint so the
 * admin can confirm which key is set without exposing it.
 */
export interface MaskedSecretField {
  /** True when a non-empty value is stored. */
  configured: boolean;
  /** Last 4 chars of the saved value preceded by bullets, e.g. "•••• 4242". */
  hint: string;
}

/** Masked credential status per provider (returned in PaymentSettingsDTO). */
export interface ProviderCredentialsStatus {
  stripe: {
    secretKey: MaskedSecretField;
    webhookSecret: MaskedSecretField;
  };
  paypal: {
    clientId: MaskedSecretField;
    clientSecret: MaskedSecretField;
    webhookId: MaskedSecretField;
    /** Plain — sandbox vs live REST host, not a secret. */
    apiBase: string;
  };
  paystack: {
    secretKey: MaskedSecretField;
  };
}

/** Admin-facing global payment settings. */
export interface PaymentSettingsDTO {
  /** Master switch — false means payments are off everywhere. */
  paymentsEnabled: boolean;
  /** Providers the seller can pick at the checkout step. Order matters. */
  enabledProviders: ProviderKey[];
  /** Free-text instructions shown on the bank-transfer checkout screen. */
  bankInstructions: string;
  /** Read-only credential status — admins paste new values via patch. */
  providers: ProviderCredentialsStatus;
  /**
   * Convenience map computed server-side: true when each provider has
   * the minimum credentials it needs to function. The frontend uses this
   * to render the "Active / Needs setup" badge without having to know
   * each provider's required field list.
   */
  providerReady: Record<ProviderKey, boolean>;
  /**
   * The billing currencies each provider can actually charge in. The
   * frontend uses this to surface only valid (provider, currency)
   * pairs at checkout. Read-only from the API — the matrix is a
   * platform constant, not an admin setting.
   */
  providerBillingCurrencies: Record<ProviderKey, readonly string[]>;
  /**
   * Union of every supported billing currency. Used by the admin plan
   * editor to constrain the price-currency dropdown.
   */
  billingCurrencies: readonly string[];
}
