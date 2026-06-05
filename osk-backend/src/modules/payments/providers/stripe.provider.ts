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
 * Stripe Checkout Sessions adapter.
 *
 * Credentials are pulled from `pricingService.getProviderSecrets()` at
 * request time, so admins can paste a new key in `/admin/pricing` and
 * the very next checkout uses it — no server restart needed. The
 * pricing service falls back to env vars if the DB is empty, keeping
 * fresh bootstraps painless.
 *
 * If no key is configured anywhere we run in sandbox mode: a fake
 * checkout URL loops the seller straight back to the success URL so
 * the lifecycle can advance without a real charge.
 */
class StripeProvider implements PaymentProvider {
  readonly key = 'stripe' as const;
  readonly label = 'Stripe (cards, Apple Pay, Google Pay)';

  async isConfigured(): Promise<boolean> {
    const { stripe } = await pricingService.getProviderSecrets();
    return !!stripe.secretKey;
  }

  async createIntent(params: CreateIntentParams): Promise<ProviderIntent> {
    const { stripe } = await pricingService.getProviderSecrets();
    const secretKey = stripe.secretKey;
    if (!secretKey) {
      if (isProd) {
        throw new Error(
          'Stripe is not configured: missing secret key in payment settings or environment',
        );
      }
      /* Sandbox fallback — short-circuit to the success URL so the lifecycle
       * can advance without a real charge. The "providerRef" is a random
       * sandbox id so we can still trace the payment in our DB. */
      const ref = `sandbox_stripe_${crypto.randomBytes(8).toString('hex')}`;
      return {
        providerRef: ref,
        redirectUrl: appendQuery(params.successUrl, {
          sandbox: '1',
          ref,
        }),
        metadata: { mode: 'sandbox' },
      };
    }

    /* Stripe wants amounts in the smallest currency unit (cents). */
    const minor = Math.round(params.amount * 100);
    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.set('success_url', params.successUrl);
    body.set('cancel_url', params.cancelUrl);
    body.set('client_reference_id', params.paymentId);
    if (params.customerEmail) body.set('customer_email', params.customerEmail);
    body.set('line_items[0][quantity]', '1');
    body.set('line_items[0][price_data][currency]', params.currency.toLowerCase());
    body.set('line_items[0][price_data][unit_amount]', String(minor));
    body.set('line_items[0][price_data][product_data][name]', params.description);
    body.set('metadata[paymentId]', params.paymentId);
    body.set('metadata[propertyId]', params.propertyId);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Stripe createIntent failed: ${res.status} ${text}`);
    }
    const session = (await res.json()) as {
      id: string;
      url: string | null;
    };
    return {
      providerRef: session.id,
      redirectUrl: session.url ?? params.cancelUrl,
      metadata: { sessionId: session.id },
    };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerificationResult> {
    const { stripe } = await pricingService.getProviderSecrets();
    if (!stripe.secretKey || !stripe.webhookSecret) {
      if (isProd) {
        return { ok: false, status: 'failed' };
      }
      /* Sandbox: accept anything with a paymentId in the body. */
      const json = safeJson(rawBody);
      const paymentId = json?.data?.object?.metadata?.paymentId;
      return {
        ok: !!paymentId,
        paymentId,
        status: 'succeeded',
      };
    }

    const sigHeader = String(headers['stripe-signature'] ?? '');
    if (!verifyStripeSignature(rawBody, sigHeader, stripe.webhookSecret)) {
      return { ok: false, status: 'failed' };
    }
    const event = safeJson(rawBody);
    const object = event?.data?.object;
    const status = event?.type === 'checkout.session.completed' ? 'succeeded'
      : event?.type === 'checkout.session.async_payment_succeeded' ? 'succeeded'
        : event?.type === 'checkout.session.async_payment_failed' ? 'failed'
          : event?.type === 'checkout.session.expired' ? 'cancelled'
            : 'processing';

    return {
      ok: true,
      paymentId: object?.metadata?.paymentId,
      status: status as VerificationResult['status'],
      amount: typeof object?.amount_total === 'number'
        ? object.amount_total / 100
        : undefined,
      currency: typeof object?.currency === 'string'
        ? object.currency.toUpperCase()
        : undefined,
    };
  }
}

/* ─── helpers ──────────────────────────────────────────────────────── */

interface StripeEventEnvelope {
  type?: string;
  data?: {
    object?: {
      metadata?: Record<string, string>;
      amount_total?: number;
      currency?: string;
    };
  };
}

function safeJson(raw: string | Buffer): StripeEventEnvelope | null {
  try {
    return JSON.parse(
      typeof raw === 'string' ? raw : raw.toString('utf8'),
    ) as StripeEventEnvelope;
  } catch {
    return null;
  }
}

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url, 'http://placeholder');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  /* Keep the original scheme/host when absolute. */
  return url.startsWith('http')
    ? u.toString()
    : `${u.pathname}?${u.searchParams.toString()}`;
}

function verifyStripeSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  /* Header looks like: t=<timestamp>,v1=<sig>,v1=<sig>...
   * We only verify the v1 scheme (HMAC-SHA256). */
  const parts = signatureHeader.split(',');
  let timestamp = '';
  const sigs: string[] = [];
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 't' && v) timestamp = v;
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!timestamp || sigs.length === 0) return false;
  const payload =
    typeof rawBody === 'string'
      ? `${timestamp}.${rawBody}`
      : `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return sigs.some((s) =>
    crypto.timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(expected, 'hex')),
  );
}

export const stripeProvider = new StripeProvider();
