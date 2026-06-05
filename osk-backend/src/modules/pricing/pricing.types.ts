/**
 * Pricing domain types — shared by model, service, controller, mappers.
 *
 * A `PricingPlan` is a server-defined rule that maps a tuple
 *   (propertyType, listingKind, country, featured)
 * to a price + currency. The resolver scans all active plans and picks
 * the most specific match; the plan with the highest `priority` wins ties.
 *
 * `wildcard` values let the admin write broad fallbacks like:
 *   "$50 base price for any homes, anywhere"
 * without listing every country.
 */

import { LISTING_KINDS, PROPERTY_TYPES } from '../properties/property.types';
import type { ListingKind, PropertyType } from '../properties/property.types';

/** Sentinel meaning "any value for this axis". */
export const PLAN_WILDCARD = '*' as const;
export type Wildcard = typeof PLAN_WILDCARD;

export type PlanPropertyType = PropertyType | Wildcard;
export type PlanListingKind = ListingKind | Wildcard;

export const PROVIDER_KEYS = [
  'stripe',
  'paypal',
  'paystack',
  'bank-transfer',
] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

/** Public DTO shape for an admin / seller pricing plan. */
export interface PricingPlanDTO {
  id: string;
  /** Human-readable label shown to admins (e.g. "Standard Home — US"). */
  name: string;
  /** Property type or '*' for any. */
  propertyType: PlanPropertyType;
  /** Listing kind or '*' for any. */
  listingKind: PlanListingKind;
  /** ISO-2 country code (uppercase) or '*' for any. */
  country: string;
  /** True if the plan is the price of the *featured upgrade* on top of base. */
  featured: boolean;
  /** Price in the smallest readable unit (e.g. 49 for $49). */
  price: number;
  /** ISO-4217 currency code (e.g. 'USD', 'CAD'). */
  currency: string;
  /** Tie-breaker when multiple matching plans exist (higher = wins). */
  priority: number;
  /** Inactive plans are ignored by the resolver. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  /** Master switch — false means everything is free, regardless of plans. */
  paymentsEnabled: boolean;
  /** Providers the seller can pick at the checkout step. Order matters. */
  enabledProviders: ProviderKey[];
  /** Free-text instructions shown on the bank-transfer checkout screen. */
  bankInstructions: string;
  /** Read-only credential status — admins paste new values via patch. */
  providers: ProviderCredentialsStatus;
}

/** The resolver returns the resolved base price + (optional) featured upgrade. */
export interface ResolvedPrice {
  base: {
    amount: number;
    currency: string;
    planId: string | null;
  };
  featured: {
    amount: number;
    currency: string;
    planId: string | null;
  } | null;
  /** True when payments are globally disabled — listing publishes free. */
  paymentsEnabled: boolean;
  /** Convenience: total the seller pays (base + featured if applicable). */
  total: number;
  /** Currency for the total. */
  currency: string;
}

/** Helpful re-exports so other modules don't drill into properties. */
export { LISTING_KINDS, PROPERTY_TYPES };
export type { ListingKind, PropertyType };
