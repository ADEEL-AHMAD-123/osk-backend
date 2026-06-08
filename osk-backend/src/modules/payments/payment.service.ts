import mongoose from 'mongoose';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { AuthUser } from '../../shared/middleware/auth';
import { pricingService } from '../pricing/pricing.service';
import { subscriptionService } from '../subscriptions/subscription.service';
import { providerSupportsCurrency } from './billing-currencies';
import { PaymentModel, type PaymentDoc } from './payment.model';
import { toPaymentDTO } from './payment.mapper';
import { getProvider } from './providers';
import type {
  PaymentDTO,
  PaymentStatus,
  ProviderKey,
  VerificationResult,
} from './payment.types';

function providerIntentErrorMessage(err: unknown): string {
  const message = String((err as { message?: unknown })?.message ?? '').trim();
  if (!message) return 'Could not start payment right now. Please try again.';

  if (/Currency not supported by merchant/i.test(message)) {
    return 'This payment method is not enabled for the subscription currency. Please choose another provider or contact support.';
  }
  if (/Invalid Email Address Passed/i.test(message)) {
    return 'A valid customer email is required by the payment provider.';
  }
  if (/not configured|missing secret key|missing client credentials/i.test(message)) {
    return 'This payment method is not configured yet. Please choose another provider or contact support.';
  }
  return message;
}

/**
 * Resolve which frontend origin should receive provider success/cancel
 * redirects. We only trust origins explicitly listed in CORS_ORIGIN.
 */
function resolveCheckoutBaseUrl(requestOrigin?: string): string {
  const fallback = env.PUBLIC_APP_URL.replace(/\/$/, '');
  if (!requestOrigin) return fallback;

  let normalized = '';
  try {
    normalized = new URL(requestOrigin).origin;
  } catch {
    return fallback;
  }

  const allowed = env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(normalized) ? normalized : fallback;
}

/**
 * Payments application layer — subscription-only.
 *
 * Entry points:
 *  - `createSubscriptionIntent` — seller picked a paid plan; we ask the
 *                                 provider for a hosted checkout session
 *                                 and hand back a redirect URL.
 *  - `handleWebhook`            — provider verifies the body; on
 *                                 success we activate the subscription.
 *  - `confirm`                  — admin-only manual confirmation
 *                                 (mostly used for bank-transfer
 *                                 subscriptions).
 *
 * Per-listing payment intents have been removed in favour of the
 * subscription model in `modules/subscriptions/`.
 */
export const paymentService = {
  /**
   * Subscription checkout. Creates a Payment row pointed at a pending
   * subscription, asks the chosen provider to mint a hosted checkout
   * session, and hands back the redirect URL. Activation happens later
   * via `markSucceeded` when the provider webhook fires.
   */
  async createSubscriptionIntent(
    actor: AuthUser,
    subscriptionId: string,
    provider: ProviderKey,
    amount: number,
    currency: string,
    planName: string,
    requestOrigin?: string,
  ): Promise<{ payment: PaymentDTO; redirectUrl: string }> {
    if (!mongoose.isValidObjectId(subscriptionId)) {
      throw new NotFoundError('Subscription not found');
    }

    const settings = await pricingService.getSettings();
    if (!settings.paymentsEnabled) {
      throw new ConflictError(
        'Payments are currently disabled by the operator.',
      );
    }
    if (!settings.enabledProviders.includes(provider)) {
      throw new ConflictError(
        `Provider "${provider}" is currently disabled by the operator.`,
      );
    }
    /* Refuse to issue an intent for a provider the admin hasn't
     * finished configuring yet — surfacing a clear setup error is far
     * better than letting the provider adapter fail with a generic
     * "missing key" later in the request. Bank-transfer is always
     * considered ready (it's a manual flow). */
    if (provider !== 'bank-transfer' && !settings.providerReady[provider]) {
      throw new ConflictError(
        `Provider "${provider}" is enabled but missing credentials. Ask the operator to finish configuring it.`,
      );
    }

    const checkoutCurrency = currency.toUpperCase();
    /* Last-line defence — subscriptionService.subscribe already
     * resolves a compatible (provider, currency) pair before reaching
     * us. This check catches calls that bypass that resolver and gives
     * a uniform message no matter which provider was picked. */
    if (!providerSupportsCurrency(provider, checkoutCurrency)) {
      throw new ConflictError(
        `${provider} cannot charge in ${checkoutCurrency} for subscription checkout. Choose another provider or currency.`,
      );
    }

    /* Reuse a still-pending intent if one exists for this subscription
     * so refreshes don't spawn parallel rows. */
    const existing = await PaymentModel.findOne({
      subscription: subscriptionId,
      provider,
      status: { $in: ['pending', 'processing'] satisfies PaymentStatus[] },
    })
      .sort({ createdAt: -1 })
      .exec();

    const payment =
      existing ??
      (await PaymentModel.create({
        subscription: subscriptionId,
        user: actor.id,
        provider,
        status: 'pending',
        amount,
        currency: checkoutCurrency,
      }));

    const adapter = getProvider(provider);
    const baseUrl = resolveCheckoutBaseUrl(requestOrigin);
    let intent;
    try {
      intent = await adapter.createIntent({
        paymentId: payment._id.toString(),
        propertyId: subscriptionId, // adapter uses this as an opaque ref
        amount,
        currency: checkoutCurrency,
        description: `OSK ${planName} subscription`,
        successUrl: `${baseUrl}/dashboard/subscription?status=success`,
        cancelUrl: `${baseUrl}/dashboard/subscription?status=cancelled`,
        customerEmail: actor.email,
      });
    } catch (err) {
      logger.warn(
        {
          actorId: actor.id,
          provider,
          subscriptionId,
          reason: String((err as { message?: unknown })?.message ?? err),
        },
        'payments.subscription provider rejected intent creation',
      );
      throw new ConflictError(providerIntentErrorMessage(err));
    }

    payment.providerRef = intent.providerRef;
    payment.metadata = new Map(Object.entries(intent.metadata));
    if (payment.status === 'pending') payment.status = 'processing';
    await payment.save();

    return { payment: toPaymentDTO(payment), redirectUrl: intent.redirectUrl };
  },

  /**
   * Admin-only confirmation — used for bank-transfer or to manually
   * resolve a stuck card payment. Activates whatever the payment is
   * pointed at (subscription).
   */
  async confirm(actor: AuthUser, paymentId: string): Promise<PaymentDTO> {
    if (actor.role !== 'admin') {
      throw new ForbiddenError('Only an admin can confirm payments manually');
    }
    const payment = await this.markSucceeded(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  },

  /** Internal — flip a payment to succeeded and activate the linked
   *  subscription. Legacy per-listing payments are no-ops here (they
   *  just flip the Payment row, no property publishing). */
  async markSucceeded(paymentId: string): Promise<PaymentDTO | null> {
    if (!mongoose.isValidObjectId(paymentId)) return null;
    const payment = await PaymentModel.findById(paymentId).exec();
    if (!payment) return null;
    if (payment.status === 'succeeded') return toPaymentDTO(payment);

    payment.status = 'succeeded';
    await payment.save();

    if (payment.subscription) {
      await subscriptionService.activate(
        payment.subscription.toString(),
        payment._id.toString(),
      );
    }
    return toPaymentDTO(payment);
  },

  /** Internal — flip a payment to a non-success terminal state. */
  async markStatus(
    paymentId: string,
    status: Exclude<PaymentStatus, 'succeeded'>,
  ): Promise<PaymentDTO | null> {
    if (!mongoose.isValidObjectId(paymentId)) return null;
    const payment = await PaymentModel.findById(paymentId).exec();
    if (!payment) return null;
    payment.status = status;
    await payment.save();
    return toPaymentDTO(payment);
  },

  async handleWebhook(
    provider: ProviderKey,
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerificationResult> {
    const adapter = getProvider(provider);
    const result = await adapter.verifyWebhook(rawBody, headers);
    if (!result.ok || !result.paymentId) return result;

    if (result.status === 'succeeded') {
      await this.markSucceeded(result.paymentId);
    } else if (result.status !== 'processing') {
      await this.markStatus(result.paymentId, result.status);
    }
    return result;
  },

  async listMine(actor: AuthUser): Promise<PaymentDTO[]> {
    const docs = await PaymentModel.find({ user: actor.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    return docs.map(toPaymentDTO);
  },

  /**
   * Fetch a single payment. Sellers can only see their own rows;
   * admins can see anyone's. Used by the bank-transfer pay page to
   * render amount + reference and check whether a proof has already
   * been uploaded.
   */
  async getById(actor: AuthUser, paymentId: string): Promise<PaymentDTO> {
    if (!mongoose.isValidObjectId(paymentId)) {
      throw new NotFoundError('Payment not found');
    }
    const doc = await PaymentModel.findById(paymentId).exec();
    if (!doc) throw new NotFoundError('Payment not found');
    if (doc.user.toString() !== actor.id && actor.role !== 'admin') {
      throw new ForbiddenError('You can only view your own payments');
    }
    return toPaymentDTO(doc);
  },

  /**
   * Attach a proof-of-payment URL (typically a screenshot of the
   * bank-transfer confirmation) to a pending payment. Restricted to
   * the seller who owns the row.
   *
   * Side-effects: nudges the payment to 'processing' so the admin
   * payments view can filter for "proof submitted, awaiting review"
   * without scanning every metadata field. The admin still has to
   * call `confirm` to actually flip it to 'succeeded'.
   */
  async attachProof(
    actor: AuthUser,
    paymentId: string,
    url: string,
  ): Promise<PaymentDTO> {
    if (!mongoose.isValidObjectId(paymentId)) {
      throw new NotFoundError('Payment not found');
    }
    const doc = await PaymentModel.findById(paymentId).exec();
    if (!doc) throw new NotFoundError('Payment not found');
    if (doc.user.toString() !== actor.id) {
      throw new ForbiddenError('You can only upload proof for your own payments');
    }
    if (doc.provider !== 'bank-transfer') {
      throw new ConflictError(
        'Proof uploads only apply to bank-transfer payments.',
      );
    }
    if (doc.status === 'succeeded' || doc.status === 'refunded') {
      throw new ConflictError(
        `This payment is already ${doc.status} — no proof needed.`,
      );
    }
    doc.proofUrl = url;
    doc.proofUploadedAt = new Date();
    if (doc.status === 'pending') doc.status = 'processing';
    await doc.save();
    return toPaymentDTO(doc);
  },

  async listAdmin(): Promise<PaymentDTO[]> {
    const docs = await PaymentModel.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
    return docs.map(toPaymentDTO);
  },

  async _doc(paymentId: string): Promise<PaymentDoc | null> {
    if (!mongoose.isValidObjectId(paymentId)) return null;
    return PaymentModel.findById(paymentId).exec();
  },
};
