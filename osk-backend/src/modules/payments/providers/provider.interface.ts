import type {
  CreateIntentParams,
  ProviderIntent,
  ProviderKey,
  VerificationResult,
} from '../payment.types';

/**
 * Common surface every payment provider implements. Keeping this small
 * means swapping one adapter (or adding a new one) is mechanical — the
 * payments service and routes don't need to change.
 */
export interface PaymentProvider {
  /** Provider key for storage + routing decisions. */
  readonly key: ProviderKey;
  /** Pretty label for admin/UI fallback. */
  readonly label: string;
  /**
   * True when real credentials are configured. Async because credentials
   * now live in the database (with env-var fallback), so the check has
   * to do a quick lookup rather than read a module-init constant.
   */
  isConfigured(): Promise<boolean>;

  /**
   * Create a payment intent (Stripe checkout session / PayPal order /
   * Paystack transaction / bank-transfer record). The redirect URL is
   * empty for bank transfers (no provider hosted page).
   */
  createIntent(params: CreateIntentParams): Promise<ProviderIntent>;

  /**
   * Verify a raw webhook payload. Implementations should validate the
   * signature header when the provider supports one. Returns the
   * normalised payment status the caller should persist.
   */
  verifyWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerificationResult>;
}
