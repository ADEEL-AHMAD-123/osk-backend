/**
 * Subscription plan domain types — shared by model, service, mapper.
 *
 * A plan is a tier the seller subscribes to (e.g. Free / Gold / Premium).
 * Each plan has:
 *  - A flat catalog ID (`slug`) for code paths to reference
 *  - Localised prices, one per currency, so the public /pricing page can
 *    show the right number based on the active country
 *  - A list of feature lines rendered on the plan card — each line carries
 *    an `included` flag (green check vs red X) and an optional numeric
 *    `limit` the app code can enforce. The `key` is the machine handle
 *    so gating logic can look up the relevant limit without parsing
 *    free-text labels.
 */

/** Pre-defined limit keys the app understands. */
export const FEATURE_KEYS = [
  'agencyProfile',
  'agents',
  'submissions',
  'featured',
  'top',
  'urgent',
  'amenities',
  'nearestLocation',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Billing cadence. */
export const PLAN_INTERVALS = ['month', 'year', 'one-time'] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

export interface PlanPrice {
  currency: string; // ISO-4217 uppercased, e.g. 'USD'
  amount: number;   // major units (e.g. 49 for $49)
}

export interface PlanFeature {
  /** Display text, e.g. "Featured Property" or "10 Agent". */
  label: string;
  /** Green check vs red X. */
  included: boolean;
  /** Machine handle for known capability — optional, free-text features may omit. */
  key?: FeatureKey;
  /**
   * Numeric cap for limit-style features (e.g. 10 agents, 100 submissions).
   * `null` = unlimited; omit for boolean features.
   */
  limit?: number | null;
}

export interface SubscriptionPlanDTO {
  id: string;
  /** Stable identifier — referenced from app code, can't be renamed. */
  slug: string;
  /** Display name — "Free", "Gold", "Premium", etc. */
  name: string;
  /** Short marketing line under the name. */
  tagline: string;
  prices: PlanPrice[];
  /** Cadence the prices represent. */
  interval: PlanInterval;
  features: PlanFeature[];
  /** Higher = rendered more prominently in the pricing grid. */
  sortOrder: number;
  /** Visually highlight (e.g. "Most popular"). */
  highlight: boolean;
  /** Inactive plans are hidden from public reads but still admin-visible. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
