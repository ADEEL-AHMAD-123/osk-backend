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
 * PayPal Orders v2 adapter.
 *
 * Credentials (clientId / clientSecret / apiBase) are read from
 * `pricingService.getProviderSecrets()` at request time — admin edits
 * in `/admin/pricing` take effect on the next checkout.
 *
 * Sandbox fallback (no client id/secret): short-circuits to success so
 * the lifecycle still advances during early setup.
 */
class PayPalProvider implements PaymentProvider {
  readonly key = 'paypal' as const;
  readonly label = 'PayPal';
  /** Cached access token + expiry (keyed by credentials to avoid leaking
   *  tokens after the admin rotates the secret). */
  private accessToken: {
    token: string;
    expiresAt: number;
    apiBase: string;
    clientId: string;
  } | null = null;

  async isConfigured(): Promise<boolean> {
    const { paypal } = await pricingService.getProviderSecrets();
    return !!(paypal.clientId && paypal.clientSecret);
  }

  async createIntent(params: CreateIntentParams): Promise<ProviderIntent> {
    const { paypal } = await pricingService.getProviderSecrets();
    if (!paypal.clientId || !paypal.clientSecret) {
      if (isProd) {
        throw new Error(
          'PayPal is not configured: missing client credentials in payment settings or environment',
        );
      }
      const ref = `sandbox_paypal_${crypto.randomBytes(8).toString('hex')}`;
      return {
        providerRef: ref,
        redirectUrl: appendQuery(params.successUrl, {
          sandbox: '1',
          ref,
        }),
        metadata: { mode: 'sandbox' },
      };
    }

    const accessToken = await this.getAccessToken(
      paypal.apiBase,
      paypal.clientId,
      paypal.clientSecret,
    );
    const res = await fetch(`${paypal.apiBase}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: params.paymentId,
            description: params.description,
            amount: {
              currency_code: params.currency.toUpperCase(),
              value: params.amount.toFixed(2),
            },
            custom_id: params.paymentId,
          },
        ],
        application_context: {
          return_url: params.successUrl,
          cancel_url: params.cancelUrl,
          user_action: 'PAY_NOW',
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PayPal createIntent failed: ${res.status} ${text}`);
    }
    const order = (await res.json()) as {
      id: string;
      links: Array<{ rel: string; href: string }>;
    };
    const approve = order.links.find((l) => l.rel === 'approve');
    return {
      providerRef: order.id,
      redirectUrl: approve?.href ?? params.cancelUrl,
      metadata: { orderId: order.id },
    };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerificationResult> {
    /* PayPal webhook signature verification is heavyweight (cert fetch +
     * RSA verify). For production correctness use the official SDK or
     * call /v1/notifications/verify-webhook-signature with the headers.
     * For now we extract the payment id + map the event to a status. */
    const json = safeJson(rawBody);
    if (!json) return { ok: false, status: 'failed' };

    const { paypal } = await pricingService.getProviderSecrets();
    const canVerify = !!(
      paypal.clientId &&
      paypal.clientSecret &&
      paypal.webhookId
    );

    if (isProd) {
      if (!canVerify) {
        return { ok: false, status: 'failed' };
      }
      const verified = await this.verifyWebhookSignature(
        paypal.apiBase,
        paypal.clientId,
        paypal.clientSecret,
        paypal.webhookId,
        headers,
        json,
      );
      if (!verified) {
        return { ok: false, status: 'failed' };
      }
    }

    const eventType = String(json.event_type ?? '');
    const resource = json.resource as
      | { custom_id?: string; amount?: { value?: string; currency_code?: string } }
      | undefined;

    const status = mapEventToStatus(eventType);
    return {
      ok: !!resource?.custom_id,
      paymentId: resource?.custom_id,
      status,
      amount: resource?.amount?.value ? Number(resource.amount.value) : undefined,
      currency: resource?.amount?.currency_code,
    };
  }

  /* ─── private helpers ─────────────────────────────────────────── */

  private async getAccessToken(
    apiBase: string,
    clientId: string,
    clientSecret: string,
  ): Promise<string> {
    /* Invalidate the cache if credentials or host changed. */
    if (
      this.accessToken &&
      this.accessToken.expiresAt > Date.now() &&
      this.accessToken.apiBase === apiBase &&
      this.accessToken.clientId === clientId
    ) {
      return this.accessToken.token;
    }
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      throw new Error(`PayPal auth failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = {
      token: body.access_token,
      /* Renew a minute early to dodge clock skew. */
      expiresAt: Date.now() + (body.expires_in - 60) * 1000,
      apiBase,
      clientId,
    };
    return body.access_token;
  }

  private async verifyWebhookSignature(
    apiBase: string,
    clientId: string,
    clientSecret: string,
    webhookId: string,
    headers: Record<string, string | string[] | undefined>,
    eventBody: Record<string, unknown>,
  ): Promise<boolean> {
    const transmissionId = firstHeader(headers['paypal-transmission-id']);
    const transmissionTime = firstHeader(headers['paypal-transmission-time']);
    const certUrl = firstHeader(headers['paypal-cert-url']);
    const authAlgo = firstHeader(headers['paypal-auth-algo']);
    const transmissionSig = firstHeader(headers['paypal-transmission-sig']);

    if (
      !transmissionId ||
      !transmissionTime ||
      !certUrl ||
      !authAlgo ||
      !transmissionSig
    ) {
      return false;
    }

    const accessToken = await this.getAccessToken(
      apiBase,
      clientId,
      clientSecret,
    );
    const res = await fetch(
      `${apiBase}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: webhookId,
          webhook_event: eventBody,
        }),
      },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { verification_status?: string };
    return body.verification_status === 'SUCCESS';
  }
}

function mapEventToStatus(event: string): VerificationResult['status'] {
  if (event === 'PAYMENT.CAPTURE.COMPLETED') return 'succeeded';
  if (event === 'CHECKOUT.ORDER.APPROVED') return 'processing';
  if (
    event === 'PAYMENT.CAPTURE.DENIED' ||
    event === 'CHECKOUT.ORDER.VOIDED'
  ) {
    return 'failed';
  }
  if (event === 'PAYMENT.CAPTURE.REFUNDED') return 'refunded';
  return 'processing';
}

function safeJson(raw: string | Buffer): Record<string, unknown> | null {
  try {
    return JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return null;
  }
}

function firstHeader(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return String(value ?? '');
}

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url, 'http://placeholder');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return url.startsWith('http')
    ? u.toString()
    : `${u.pathname}?${u.searchParams.toString()}`;
}

export const paypalProvider = new PayPalProvider();
