import { PROVIDER_KEYS, type ProviderKey } from '../pricing/pricing.types';

/** Payment lifecycle — covers every state across all four providers. */
export const PAYMENT_STATUSES = [
  /** Intent created; user hasn't redirected to provider yet. */
  'pending',
  /** User redirected to provider OR provider acknowledged but not finalised. */
  'processing',
  /** Money received / cleared. Property publishes when this flips. */
  'succeeded',
  /** Provider rejected the charge OR the user abandoned the flow. */
  'failed',
  /** Admin cancelled — usually for stuck bank-transfer intents. */
  'cancelled',
  /** Refunded after success (manual / dispute). */
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export { PROVIDER_KEYS };
export type { ProviderKey };

/** Public DTO returned to the seller dashboard + admin views. */
export interface PaymentDTO {
  id: string;
  /** Empty string when this payment is for a subscription rather than a
   *  specific listing — keeps the DTO shape flat for the frontend. */
  propertyId: string;
  /** Set when this payment activates / renews a subscription. */
  subscriptionId: string | null;
  userId: string;
  provider: ProviderKey;
  status: PaymentStatus;
  amount: number;
  currency: string;
  /** Provider's transaction / session id, when available. */
  providerRef?: string;
  /** Provider-specific opaque metadata, e.g. checkout url for redirect. */
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/** Input to a provider when creating a new intent. */
export interface CreateIntentParams {
  paymentId: string;
  propertyId: string;
  amount: number;
  currency: string;
  /** Where the user should land after a successful charge. */
  successUrl: string;
  /** Where the user should land after they abandon / fail. */
  cancelUrl: string;
  /** Free-text label used by some providers for receipts. */
  description: string;
  /** User's email — used by some providers for receipts. */
  customerEmail?: string;
}

/** The shape every provider returns from createIntent. */
export interface ProviderIntent {
  /** Provider's transaction reference (session id / order id / etc.). */
  providerRef: string;
  /** URL the user should be redirected to (or empty for client-side flows). */
  redirectUrl: string;
  /** Anything we need to persist for later verification. */
  metadata: Record<string, string>;
}

/** Result of verifying a webhook payload. */
export interface VerificationResult {
  ok: boolean;
  /** Our internal payment id (extracted from provider metadata). */
  paymentId?: string;
  /** Provider's confirmed status. */
  status: PaymentStatus;
  /** Amount / currency the provider confirms (for sanity checking). */
  amount?: number;
  currency?: string;
}
