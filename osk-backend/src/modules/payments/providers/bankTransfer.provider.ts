import crypto from 'node:crypto';
import type {
  CreateIntentParams,
  ProviderIntent,
  VerificationResult,
} from '../payment.types';
import type { PaymentProvider } from './provider.interface';

/**
 * Bank-transfer adapter.
 *
 * There's no integration here — the seller is told to wire money to the
 * bank details the admin has configured, and the admin then marks the
 * payment paid via POST /payments/:id/confirm. The "redirect URL" sends
 * the user to a status page on the front-end that shows the instructions.
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
    return {
      providerRef: ref,
      redirectUrl: appendQuery(params.successUrl, {
        bank: '1',
        ref,
      }),
      metadata: { mode: 'bank-transfer' },
    };
  }

  async verifyWebhook(): Promise<VerificationResult> {
    /* No webhooks for bank transfer — confirmation goes through the
     * admin-only confirm endpoint. */
    return { ok: false, status: 'failed' };
  }
}

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url, 'http://placeholder');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return url.startsWith('http')
    ? u.toString()
    : `${u.pathname}?${u.searchParams.toString()}`;
}

export const bankTransferProvider = new BankTransferProvider();
