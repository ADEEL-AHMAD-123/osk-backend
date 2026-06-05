import mongoose from 'mongoose';
import { NotFoundError } from '../../shared/errors';
import { decryptSecret, encryptSecret } from '../../shared/crypto/secrets';
import { env } from '../../config/env';
import { PricingPlanModel, type PricingPlanDoc } from './pricingPlan.model';
import { PaymentSettingsModel } from './paymentSettings.model';
import { toPaymentSettingsDTO, toPricingPlanDTO } from './pricing.mapper';
import type {
  CreatePlanInput,
  ResolveInput,
  UpdatePlanInput,
  UpdateSettingsInput,
} from './pricing.schema';
import { PLAN_WILDCARD, type PaymentSettingsDTO, type PricingPlanDTO, type ResolvedPrice } from './pricing.types';

/**
 * Decrypted credentials used by provider adapters at request time. Each
 * field falls back to the env var if the DB hasn't been configured yet,
 * so a fresh deployment still works while the admin is mid-setup.
 */
export interface ProviderSecrets {
  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    apiBase: string;
    webhookId: string;
  };
  paystack: {
    secretKey: string;
  };
}

function dbOrEnv(stored: string, envValue: string | undefined): string {
  const decoded = decryptSecret(stored);
  return decoded || envValue || '';
}

/**
 * Resolve a plan score — higher is more specific. We prefer exact axis
 * matches over wildcards so an admin can layer fine rules on top of broad
 * fallbacks without having to delete the fallback.
 */
function specificityScore(plan: PricingPlanDoc): number {
  let score = 0;
  /* Country decides the pricing/currency region, so country-specific
   * plans must beat global fallbacks even when those fallbacks are more
   * specific on type/kind. Within the same country slice, type/kind
   * still refine the match as before. */
  if (plan.country !== PLAN_WILDCARD) score += 8;
  if (plan.propertyType !== PLAN_WILDCARD) score += 4;
  if (plan.listingKind !== PLAN_WILDCARD) score += 2;
  return score;
}

function pickBest(plans: PricingPlanDoc[]): PricingPlanDoc | null {
  if (plans.length === 0) return null;
  return plans.reduce((best, current) => {
    const a = specificityScore(current);
    const b = specificityScore(best);
    if (a > b) return current;
    if (a < b) return best;
    /* Ties broken by admin-set priority (high wins), then newest first. */
    if (current.priority !== best.priority) {
      return current.priority > best.priority ? current : best;
    }
    return current.createdAt > best.createdAt ? current : best;
  });
}

/** Filter the candidate plans so each axis is either an exact match or wildcard. */
function matchPlans(
  plans: PricingPlanDoc[],
  q: ResolveInput,
  featured: boolean,
): PricingPlanDoc[] {
  return plans.filter((p) => {
    if (p.featured !== featured) return false;
    if (
      p.propertyType !== PLAN_WILDCARD &&
      p.propertyType !== q.propertyType
    ) {
      return false;
    }
    if (
      p.listingKind !== PLAN_WILDCARD &&
      p.listingKind !== q.listingKind
    ) {
      return false;
    }
    if (p.country !== PLAN_WILDCARD && p.country !== q.country) {
      return false;
    }
    return true;
  });
}

export const pricingService = {
  /* ─── Plans CRUD ───────────────────────────────────────────────── */

  async listPlans(): Promise<PricingPlanDTO[]> {
    const docs = await PricingPlanModel.find()
      .sort({ active: -1, featured: 1, priority: -1, createdAt: -1 })
      .exec();
    return docs.map(toPricingPlanDTO);
  },

  async createPlan(input: CreatePlanInput): Promise<PricingPlanDTO> {
    const doc = await PricingPlanModel.create(input);
    return toPricingPlanDTO(doc);
  },

  async updatePlan(
    id: string,
    input: UpdatePlanInput,
  ): Promise<PricingPlanDTO> {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Pricing plan not found');
    }
    const doc = await PricingPlanModel.findByIdAndUpdate(id, input, {
      new: true,
      runValidators: true,
    }).exec();
    if (!doc) throw new NotFoundError('Pricing plan not found');
    return toPricingPlanDTO(doc);
  },

  async deletePlan(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Pricing plan not found');
    }
    const res = await PricingPlanModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundError('Pricing plan not found');
  },

  /* ─── Settings (singleton) ────────────────────────────────────── */

  async getSettings(): Promise<PaymentSettingsDTO> {
    let doc = await PaymentSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await PaymentSettingsModel.create({ singletonKey: 'default' });
    }
    return toPaymentSettingsDTO(doc);
  },

  async updateSettings(
    input: UpdateSettingsInput,
  ): Promise<PaymentSettingsDTO> {
    /* Build a $set object so nested credential fields the caller didn't
     * send aren't blown away. Provider secret values are encrypted on
     * the way in — the schema only allows strings up to 512 chars (raw),
     * which compresses to ~700 chars of ciphertext (well under the
     * default mongoose string cap). */
    const update: Record<string, unknown> = {};

    if (typeof input.paymentsEnabled === 'boolean') {
      update.paymentsEnabled = input.paymentsEnabled;
    }
    if (Array.isArray(input.enabledProviders)) {
      update.enabledProviders = input.enabledProviders;
    }
    if (typeof input.bankInstructions === 'string') {
      update.bankInstructions = input.bankInstructions;
    }

    /* Stripe — encrypt each provided field before persisting. */
    if (input.stripe) {
      if (typeof input.stripe.secretKey === 'string') {
        update['stripe.secretKey'] = encryptSecret(input.stripe.secretKey);
      }
      if (typeof input.stripe.webhookSecret === 'string') {
        update['stripe.webhookSecret'] = encryptSecret(
          input.stripe.webhookSecret,
        );
      }
    }
    if (input.paypal) {
      if (typeof input.paypal.clientId === 'string') {
        update['paypal.clientId'] = encryptSecret(input.paypal.clientId);
      }
      if (typeof input.paypal.clientSecret === 'string') {
        update['paypal.clientSecret'] = encryptSecret(
          input.paypal.clientSecret,
        );
      }
      if (typeof input.paypal.apiBase === 'string') {
        /* apiBase is not a secret — sandbox vs live URL is visible info. */
        update['paypal.apiBase'] = input.paypal.apiBase;
      }
      if (typeof input.paypal.webhookId === 'string') {
        update['paypal.webhookId'] = encryptSecret(input.paypal.webhookId);
      }
    }
    if (input.paystack) {
      if (typeof input.paystack.secretKey === 'string') {
        update['paystack.secretKey'] = encryptSecret(
          input.paystack.secretKey,
        );
      }
    }

    const doc = await PaymentSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      { $set: update, $setOnInsert: { singletonKey: 'default' } },
      { new: true, upsert: true, runValidators: true },
    ).exec();
    return toPaymentSettingsDTO(doc);
  },

  /**
   * Decrypted credentials used by provider adapters at request time.
   * Reads the singleton; for every field, prefers the DB value and
   * falls back to the matching env var so bootstrap deployments still
   * work before the admin has filled anything in.
   */
  async getProviderSecrets(): Promise<ProviderSecrets> {
    let doc = await PaymentSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await PaymentSettingsModel.create({ singletonKey: 'default' });
    }
    return {
      stripe: {
        secretKey: dbOrEnv(doc.stripe?.secretKey ?? '', env.STRIPE_SECRET_KEY),
        webhookSecret: dbOrEnv(
          doc.stripe?.webhookSecret ?? '',
          env.STRIPE_WEBHOOK_SECRET,
        ),
      },
      paypal: {
        clientId: dbOrEnv(doc.paypal?.clientId ?? '', env.PAYPAL_CLIENT_ID),
        clientSecret: dbOrEnv(
          doc.paypal?.clientSecret ?? '',
          env.PAYPAL_CLIENT_SECRET,
        ),
        apiBase:
          doc.paypal?.apiBase ||
          env.PAYPAL_API_BASE ||
          'https://api-m.sandbox.paypal.com',
        webhookId: dbOrEnv(
          doc.paypal?.webhookId ?? '',
          env.PAYPAL_WEBHOOK_ID,
        ),
      },
      paystack: {
        secretKey: dbOrEnv(
          doc.paystack?.secretKey ?? '',
          env.PAYSTACK_SECRET_KEY,
        ),
      },
    };
  },

  /* ─── Resolver ────────────────────────────────────────────────── */

  /**
   * Resolve the price a seller pays for a listing matching `(type, kind,
   * country, featured)`. Returns the base price + optional featured
   * add-on. Returns {paymentsEnabled:false, …} if the global toggle is
   * off — callers can use this to skip the payment step entirely.
   */
  async resolve(input: ResolveInput): Promise<ResolvedPrice> {
    const settings = await this.getSettings();
    if (!settings.paymentsEnabled) {
      return {
        base: { amount: 0, currency: 'USD', planId: null },
        featured: null,
        paymentsEnabled: false,
        total: 0,
        currency: 'USD',
      };
    }

    /* Single read for both featured / non-featured matches so the resolver
     * doesn't need to round-trip mongo twice. */
    const candidates = await PricingPlanModel.find({ active: true }).exec();

    const baseMatch = pickBest(matchPlans(candidates, input, false));
    const featuredMatch = input.featured
      ? pickBest(matchPlans(candidates, input, true))
      : null;

    const base = baseMatch
      ? {
          amount: baseMatch.price,
          currency: baseMatch.currency,
          planId: baseMatch._id.toString(),
        }
      : { amount: 0, currency: 'USD', planId: null };

    const featured = featuredMatch
      ? {
          amount: featuredMatch.price,
          currency: featuredMatch.currency,
          planId: featuredMatch._id.toString(),
        }
      : null;

    /* Mixed currencies between base + featured would be a pricing setup
     * bug. We coerce to the base currency for the total — admins should
     * keep currencies aligned in the matching slice. */
    const total = base.amount + (featured?.amount ?? 0);
    return {
      base,
      featured,
      paymentsEnabled: true,
      total,
      currency: base.currency,
    };
  },
};
