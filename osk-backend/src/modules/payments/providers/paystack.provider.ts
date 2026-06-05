import crypto from 'node:crypto';
import { isProd } from '../../../config/env';
import { pricingService } from '../../pricing/pricing.service';
import type {
  CreateIntentParams,
  ProviderIntent,
  VerificationResult,
} from '../payment.types';
import type { PaymentProvider } from './provider.interface';

/**
 * Paystack adapter (transaction/initialize → checkout.paystack.com flow).
 *
 * Credentials live in PaymentSettings and are decrypted at request time
 * via `pricingService.getProviderSecrets()`. Env vars act as a bootstrap
 * fallback so a fresh deploy still works while the admin is mid-setup.
 *
 * Paystack only supports a subset of currencies — NGN, GHS, ZAR, USD,
 * KES. If a seller's listing resolves to an unsupported currency the
 * route layer should hide the Paystack option; here we just pass through.
 */
class PaystackProvider implements PaymentProvider {
  readonly key = 'paystack' as const;
  readonly label = 'Paystack (cards, mobile money)';

  async isConfigured(): Promise<boolean> {
    const { paystack } = await pricingService.getProviderSecrets();
    return !!paystack.secretKey;
  }

  async createIntent(params: CreateIntentParams): Promise<ProviderIntent> {
    const { paystack } = await pricingService.getProviderSecrets();
    if (!paystack.secretKey) {
      if (isProd) {
        throw new Error(
          'Paystack is not configured: missing secret key in payment settings or environment',
        );
      }
      const ref = `sandbox_paystack_${crypto.randomBytes(8).toString('hex')}`;
      return {
        providerRef: ref,
        redirectUrl: appendQuery(params.successUrl, {
          sandbox: '1',
          ref,
        }),
        metadata: { mode: 'sandbox' },
      };
    }

    /* Paystack expects amount in the smallest currency unit (kobo for NGN,
     * cents for USD, etc.). */
    const minor = Math.round(params.amount * 100);
    const res = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystack.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: minor,
          currency: params.currency.toUpperCase(),
          email: params.customerEmail ?? `seller-${params.paymentId}@example.com`,
          callback_url: params.successUrl,
          reference: params.paymentId,
          metadata: {
            paymentId: params.paymentId,
            propertyId: params.propertyId,
          },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Paystack init failed: ${res.status} ${text}`);
    }
    const body = (await res.json()) as {
      data: { authorization_url: string; reference: string };
    };
    return {
      providerRef: body.data.reference,
      redirectUrl: body.data.authorization_url,
      metadata: { reference: body.data.reference },
    };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerificationResult> {
    const { paystack } = await pricingService.getProviderSecrets();
    if (!paystack.secretKey) {
      if (isProd) {
        return { ok: false, status: 'failed' };
      }
      const json = safeJson(rawBody);
      const ref = String(json?.data?.reference ?? '');
      return {
        ok: !!ref,
        paymentId: ref,
        status: 'succeeded',
      };
    }

    const signature = String(headers['x-paystack-signature'] ?? '');
    const expected = crypto
      .createHmac('sha512', paystack.secretKey)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      .digest('hex');
    if (
      !signature ||
      !crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      )
    ) {
      return { ok: false, status: 'failed' };
    }

    const json = safeJson(rawBody);
    const status =
      json?.event === 'charge.success' ? 'succeeded'
        : json?.event === 'charge.failed' ? 'failed'
          : 'processing';

    return {
      ok: true,
      paymentId: String(json?.data?.reference ?? ''),
      status: status as VerificationResult['status'],
      amount: typeof json?.data?.amount === 'number'
        ? Number(json.data.amount) / 100
        : undefined,
      currency: typeof json?.data?.currency === 'string'
        ? String(json.data.currency).toUpperCase()
        : undefined,
    };
  }
}

function safeJson(raw: string | Buffer): {
  event?: string;
  data?: { reference?: string; amount?: number; currency?: string };
} | null {
  try {
    return JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return null;
  }
}

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url, 'http://placeholder');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return url.startsWith('http')
    ? u.toString()
    : `${u.pathname}?${u.searchParams.toString()}`;
}

export const paystackProvider = new PaystackProvider();
