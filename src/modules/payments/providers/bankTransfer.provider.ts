import crypto from 'node:crypto';
import { env } from '../../../config/env';
import type {
  CreateIntentParams,
  ProviderIntent,
  VerificationResult,
} from '../payment.types';
import type { PaymentProvider } from './provider.interface';

/** Pull the origin off whichever URL the caller already resolved
 *  (params.successUrl is the live-request-aware base coming from
 *  `resolveCheckoutBaseUrl(requestOrigin)`), so the bank-transfer
 *  redirect lands on the same frontend the seller started on — even
 *  when there are multiple frontend domains. Falls back to
 *  PUBLIC_APP_URL only if the URL is unparseable, which it shouldn't
 *  be in practice. */
function baseFromSuccessUrl(successUrl: string): string {
  try {
    return new URL(successUrl).origin;
  } catch {
    return env.PUBLIC_APP_URL.replace(/\/$/, '');
  }
}

/**
 * Bank-transfer adapter.
 *
 * There's no provider integration — the seller is told to wire money
 * to the bank details the admin configured, and the admin then
 * confirms the payment from /admin/payments after the wire clears.
 *
 * The redirect URL points to a dedicated front-end page that shows
 * the bank instructions, the amount due, and lets the seller upload
 * a screenshot of the payment as proof. The pay page knows nothing
 * about the original successUrl — `paymentId` is enough to fetch
 * everything else.
 */
class BankTransferProvider implements PaymentProvider {
  readonly key = 'bank-transfer' as const;
  readonly label = 'Bank transfer';

  async isConfigured(): Promise<boolean> {
    /* Always available — relies on out-of-band confirmation by an admin. */
    return true;
  }

  async createIntent(params: CreateIntentParams): Promise<ProviderIntent> {
    const ref = `bank_${crypto.randomBytes(8).toString('hex')}`;
    /* Re-use the live-request-aware base the payment service already
     * resolved for `successUrl` so multi-domain deploys redirect back
     * to whichever frontend the seller initiated checkout from. */
    const baseUrl = baseFromSuccessUrl(params.successUrl);
    return {
      providerRef: ref,
      redirectUrl: `${baseUrl}/dashboard/subscription/bank-transfer/${params.paymentId}`,
      metadata: { mode: 'bank-transfer', ref },
    };
  }

  async verifyWebhook(): Promise<VerificationResult> {
    /* No webhooks for bank transfer — confirmation goes through the
     * admin-only confirm endpoint. */
    return { ok: false, status: 'failed' };
  }
}

export const bankTransferProvider = new BankTransferProvider();
