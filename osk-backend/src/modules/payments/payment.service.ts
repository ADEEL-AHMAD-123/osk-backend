import mongoose from 'mongoose';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { AuthUser } from '../../shared/middleware/auth';
import { PropertyModel } from '../properties/property.model';
import { propertyService } from '../properties/property.service';
import { pricingService } from '../pricing/pricing.service';
import { PaymentModel, type PaymentDoc } from './payment.model';
import { toPaymentDTO } from './payment.mapper';
import { getProvider } from './providers';
import type {
  PaymentDTO,
  PaymentStatus,
  ProviderKey,
  VerificationResult,
} from './payment.types';

const PAYSTACK_SUPPORTED_CURRENCIES = new Set([
  'NGN',
]);

function providerIntentErrorMessage(err: unknown): string {
  const message = String((err as { message?: unknown })?.message ?? '').trim();
  if (!message) return 'Could not start payment right now. Please try again.';

  if (/Currency not supported by merchant/i.test(message)) {
    return 'This payment method is not enabled for the listing currency. Please choose another provider or contact support.';
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
 * Payments application layer.
 *
 * Two main entry points:
 *  - `createIntent`   — seller picks a provider; we resolve the price,
 *                       create a Payment row in 'pending', call the
 *                       provider adapter and persist the returned ref.
 *  - `handleWebhook`  — provider adapter parses + verifies the body;
 *                       on success we promote the property to 'published'.
 *
 * Manual confirmation (bank-transfer) uses `confirm` instead.
 */
export const paymentService = {
  async createIntent(
    actor: AuthUser,
    propertyId: string,
    provider: ProviderKey,
  ): Promise<{ payment: PaymentDTO; redirectUrl: string }> {
    if (!mongoose.isValidObjectId(propertyId)) {
      throw new NotFoundError('Property not found');
    }
    const property = await PropertyModel.findById(propertyId).exec();
    if (!property) throw new NotFoundError('Property not found');
    if (property.owner.toString() !== actor.id && actor.role !== 'admin') {
      throw new ForbiddenError('Only the listing owner can pay for it');
    }
    if (property.status !== 'awaiting-payment') {
      throw new ConflictError(
        `Listing is "${property.status}" — payments are only accepted on awaiting-payment listings`,
      );
    }

    /* Re-resolve price now so a seller never pays last week's number. */
    const price = await pricingService.resolve({
      propertyType: property.type,
      listingKind: property.listingKind,
      country: property.country,
      featured: property.isFeatured,
    });
    if (!price.paymentsEnabled || price.total === 0) {
      /* Edge case: admin disabled payments after approval. Publish + bail. */
      await propertyService.markPaidAndPublish(propertyId);
      throw new ConflictError(
        'Payments are currently disabled — your listing has been published.',
      );
    }

    /* Validate selected provider is enabled in admin settings. */
    const settings = await pricingService.getSettings();
    if (!settings.enabledProviders.includes(provider)) {
      throw new ConflictError(
        `Provider "${provider}" is currently disabled by the operator.`,
      );
    }

    if (
      provider === 'paystack' &&
      !PAYSTACK_SUPPORTED_CURRENCIES.has(price.currency.toUpperCase())
    ) {
      throw new ConflictError(
        `Paystack does not support ${price.currency.toUpperCase()} for this listing. Please choose Stripe, PayPal, or bank transfer.`,
      );
    }

    /* Reuse a still-pending intent if it exists, to avoid leaving orphans. */
    const existing = await PaymentModel.findOne({
      property: property._id,
      provider,
      status: { $in: ['pending', 'processing'] satisfies PaymentStatus[] },
    })
      .sort({ createdAt: -1 })
      .exec();

    const payment =
      existing ??
      (await PaymentModel.create({
        property: property._id,
        user: actor.id,
        provider,
        status: 'pending',
        amount: price.total,
        currency: price.currency,
        basePlan: price.base.planId ?? undefined,
        featuredPlan: price.featured?.planId ?? undefined,
      }));

    /* Always re-issue the intent — providers may have invalidated stale
     * sessions. We persist the new ref + metadata on the existing row. */
    const adapter = getProvider(provider);
    const baseUrl = env.PUBLIC_APP_URL.replace(/\/$/, '');
    let intent;
    try {
      intent = await adapter.createIntent({
        paymentId: payment._id.toString(),
        propertyId: property._id.toString(),
        amount: price.total,
        currency: price.currency,
        description: `OSK listing — ${property.title}`,
        successUrl: `${baseUrl}/dashboard/listings/${property.slug}/payment?status=success`,
        cancelUrl: `${baseUrl}/dashboard/listings/${property.slug}/payment?status=cancelled`,
        customerEmail: actor.email,
      });
    } catch (err) {
      logger.warn(
        {
          actorId: actor.id,
          provider,
          propertyId: property._id.toString(),
          price: {
            total: price.total,
            currency: price.currency,
          },
          reason: String((err as { message?: unknown })?.message ?? err),
        },
        'payments.intent provider rejected intent creation',
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
   * resolve a stuck card payment. Promotes the listing to published.
   */
  async confirm(actor: AuthUser, paymentId: string): Promise<PaymentDTO> {
    if (actor.role !== 'admin') {
      throw new ForbiddenError('Only an admin can confirm payments manually');
    }
    const payment = await this.markSucceeded(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  },

  /** Internal — bump the listing + payment to succeeded/published. */
  async markSucceeded(paymentId: string): Promise<PaymentDTO | null> {
    if (!mongoose.isValidObjectId(paymentId)) return null;
    const payment = await PaymentModel.findById(paymentId).exec();
    if (!payment) return null;
    if (payment.status === 'succeeded') return toPaymentDTO(payment);

    payment.status = 'succeeded';
    await payment.save();
    /* Side-effect: publish the property — fire and forget, the payment
     * itself is the source of truth. */
    await propertyService.markPaidAndPublish(payment.property.toString());
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

  async listForProperty(
    actor: AuthUser,
    propertyId: string,
  ): Promise<PaymentDTO[]> {
    if (!mongoose.isValidObjectId(propertyId)) return [];
    const property = await PropertyModel.findById(propertyId).exec();
    if (!property) return [];
    if (
      property.owner.toString() !== actor.id &&
      actor.role !== 'admin'
    ) {
      throw new ForbiddenError('You can only view your own payments');
    }
    const docs = await PaymentModel.find({ property: property._id })
      .sort({ createdAt: -1 })
      .exec();
    return docs.map(toPaymentDTO);
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
