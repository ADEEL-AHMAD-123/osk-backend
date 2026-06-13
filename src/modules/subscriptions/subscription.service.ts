import mongoose from 'mongoose';
import {
  ConflictError,
  NotFoundError,
} from '../../shared/errors';
import {
  PROVIDER_BILLING_CURRENCIES,
  providerSupportsCurrency,
} from '../payments/billing-currencies';
import type { ProviderKey } from '../payments/payment.types';
import { UserModel } from '../auth/user.model';
import {
  sendSubscriptionActivatedEmail,
  sendSubscriptionCancelledEmail,
} from '../../shared/email/notificationEmails';
import { logger } from '../../config/logger';
import { SubscriptionModel, type SubscriptionDoc } from './subscription.model';
import { toSubscriptionDTO } from './subscription.mapper';
import type { SubscriptionPlanDoc } from './subscriptionPlan.model';
import { subscriptionPlanService } from './subscriptionPlan.service';
import type {
  SubscriptionDTO,
  SubscriptionStatus,
} from './subscription.types';
import type { FeatureKey, PlanFeature } from './subscriptionPlan.types';

/* ─────────────────────────────────────────────────────────────────────────
 * Subscription service — one active sub per user, lifecycle:
 *
 *   subscribe ──→ pending-payment  ──(payment ok)──→ active
 *                                  ──(seller cancels)──→ cancelled
 *                                  ──(period ends)─────→ expired
 *
 * `activate` is the seam payments call when a charge clears. It sets the
 * status to 'active' and pushes currentPeriodEnd one billing cycle out.
 * ──────────────────────────────────────────────────────────────────────── */

/** Computed view of which features + limits the user currently enjoys. */
export interface ResolvedSubscription {
  status: SubscriptionStatus | 'none';
  plan: {
    id: string;
    slug: string;
    name: string;
    features: PlanFeature[];
  } | null;
  /** Map of known FeatureKey → boolean for "is enabled?". */
  enabled: Partial<Record<FeatureKey, boolean>>;
  /** Map of FeatureKey → limit (null = unlimited). */
  limits: Partial<Record<FeatureKey, number | null>>;
}

/**
 * The (provider, billingCurrency, amount) tuple a paid subscription
 * will actually be charged with at checkout. Display localisation is
 * a frontend concern; the server only deals in real money.
 */
export interface CheckoutPair {
  provider: ProviderKey;
  currency: string;
  amount: number;
}

/**
 * Find a billing currency in `plan.prices` that the chosen provider
 * can charge in. Prefers `preferredCurrency` (typically the user's
 * locale currency); falls back to the first compatible price. Throws
 * a ConflictError with an explanation when no pair is possible — that
 * way the seller gets "Paystack can't charge plan Gold in any
 * supported currency" instead of a generic provider error.
 */
export function resolveCheckoutPair(
  plan: SubscriptionPlanDoc,
  provider: ProviderKey,
  preferredCurrency?: string,
): CheckoutPair {
  const providerCurrencies = PROVIDER_BILLING_CURRENCIES[provider] as readonly string[];
  const pref = preferredCurrency?.toUpperCase();

  /* Prefer exact match between the user's hinted currency and what
   * the provider can charge. */
  if (pref) {
    const exact = plan.prices.find(
      (p) => p.currency === pref && providerCurrencies.includes(p.currency),
    );
    if (exact) return { provider, currency: exact.currency, amount: exact.amount };
  }

  /* Otherwise pick the first plan price whose currency the provider
   * supports. Admins are expected to keep USD as a fallback in every
   * paid plan so this almost always matches. */
  const match = plan.prices.find((p) => providerCurrencies.includes(p.currency));
  if (match) return { provider, currency: match.currency, amount: match.amount };

  /* No compatible currency. */
  const planCurrencies = plan.prices.map((p) => p.currency).join(', ') || '—';
  throw new ConflictError(
    `${provider} cannot charge plan "${plan.name}" — provider supports ${providerCurrencies.join(
      ', ',
    )} but the plan is priced in ${planCurrencies}. Ask the operator to add a compatible currency.`,
  );
}

function rollPeriodEnd(
  from: Date,
  interval: 'month' | 'year' | 'one-time',
): Date {
  const next = new Date(from.getTime());
  if (interval === 'month') next.setMonth(next.getMonth() + 1);
  if (interval === 'year') next.setFullYear(next.getFullYear() + 1);
  if (interval === 'one-time') {
    /* Lifetime — pretend it expires far in the future. */
    next.setFullYear(next.getFullYear() + 100);
  }
  return next;
}

export const subscriptionService = {
  /** Return the user's most-recent subscription, or null if none. */
  async getCurrent(userId: string): Promise<SubscriptionDoc | null> {
    if (!mongoose.isValidObjectId(userId)) return null;
    return SubscriptionModel.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .exec();
  },

  /** Public-DTO version of `getCurrent` for the dashboard view. */
  async getCurrentDTO(userId: string): Promise<SubscriptionDTO | null> {
    const doc = await this.getCurrent(userId);
    return doc ? toSubscriptionDTO(doc) : null;
  },

  /**
   * Resolve which features + limits a user currently has. Returns 'none'
   * status when the user has no subscription yet — callers should treat
   * that as "redirect to /pricing".
   */
  async resolve(userId: string): Promise<ResolvedSubscription> {
    const doc = await this.getCurrent(userId);
    if (!doc) {
      return { status: 'none', plan: null, enabled: {}, limits: {} };
    }
    const plan = await subscriptionPlanService.getById(doc.plan.toString());
    if (!plan) {
      return { status: doc.status, plan: null, enabled: {}, limits: {} };
    }
    const enabled: ResolvedSubscription['enabled'] = {};
    const limits: ResolvedSubscription['limits'] = {};
    for (const f of plan.features) {
      if (!f.key) continue;
      enabled[f.key] = !!f.included;
      if (f.limit !== undefined) limits[f.key] = f.limit;
    }
    return {
      status: doc.status,
      plan: {
        id: plan._id.toString(),
        slug: plan.slug,
        name: plan.name,
        features: plan.features,
      },
      enabled,
      limits,
    };
  },

  /**
   * Start a new subscription for `userId` on plan `planId`.
   *
   *  - Free plan (no prices, or all amounts = 0): activated immediately
   *    and `checkout` is null on the return.
   *  - Paid plan: requires `provider`. The service resolves the
   *    (provider, billingCurrency, amount) pair using `preferredCurrency`
   *    as a hint, persists a pending-payment subscription, and returns
   *    the resolved pair so the controller can ask the payment service
   *    for an intent without re-deriving it.
   *
   * Currency hint defaults to the user's local currency (passed by the
   * frontend). The resolver still picks a different currency if the
   * provider can't charge the local one.
   */
  async subscribe(
    userId: string,
    planId: string,
    opts: {
      provider?: ProviderKey;
      preferredCurrency?: string;
    } = {},
  ): Promise<{ doc: SubscriptionDoc; checkout: CheckoutPair | null }> {
    if (!mongoose.isValidObjectId(planId)) {
      throw new NotFoundError('Plan not found');
    }
    const plan = await subscriptionPlanService.getById(planId);
    if (!plan || !plan.active) {
      throw new NotFoundError('Plan not available');
    }

    /* Free path: plan has no prices, or every price is zero. */
    const isFree =
      plan.prices.length === 0 || plan.prices.every((p) => p.amount === 0);

    /* Replace any existing subscription row — keeps things simple; the
     * history table is the Payments collection. Same-plan + active is
     * a no-op: telling the user to "manage subscription" is clearer
     * than silently re-running the subscribe flow. */
    const existing = await this.getCurrent(userId);
    if (existing && existing.planSlug === plan.slug && existing.status === 'active') {
      throw new ConflictError(
        `You're already on the ${plan.name} plan. Visit your dashboard to manage it.`,
      );
    }

    const now = new Date();
    const doc =
      existing ??
      new SubscriptionModel({
        user: userId,
        plan: plan._id,
        planSlug: plan.slug,
      });
    doc.plan = plan._id;
    doc.planSlug = plan.slug;
    doc.cancelledAt = null;

    if (isFree) {
      doc.status = 'active';
      doc.startedAt = now;
      doc.currentPeriodEnd = rollPeriodEnd(now, plan.interval);
      doc.payment = null;
      await doc.save();
      return { doc, checkout: null };
    }

    /* Paid path — must have a provider. The resolver throws a
     * descriptive ConflictError if no compatible (provider, currency)
     * pair exists, so the user gets a useful message rather than a
     * generic provider failure later in the request. */
    if (!opts.provider) {
      throw new ConflictError(
        'This plan is paid — pick a payment method to continue.',
      );
    }
    const checkout = resolveCheckoutPair(
      plan,
      opts.provider,
      opts.preferredCurrency,
    );
    /* Belt-and-suspenders: the resolver already enforces this, but
     * keep an assertion in case admins ever add a non-billing
     * currency to a plan through some path that bypasses validation. */
    if (!providerSupportsCurrency(checkout.provider, checkout.currency)) {
      throw new ConflictError(
        `${checkout.provider} cannot charge in ${checkout.currency}.`,
      );
    }

    doc.status = 'pending-payment';
    /* Period starts on payment success, not here. */
    await doc.save();
    return { doc, checkout };
  },

  /**
   * Called from the payments module when a charge succeeds against a
   * subscription. Activates it + rolls the period end forward.
   */
  async activate(
    subscriptionId: string,
    paymentId: string,
  ): Promise<SubscriptionDoc | null> {
    if (!mongoose.isValidObjectId(subscriptionId)) return null;
    const doc = await SubscriptionModel.findById(subscriptionId).exec();
    if (!doc) return null;
    const plan = await subscriptionPlanService.getById(doc.plan.toString());
    const interval = plan?.interval ?? 'month';
    const now = new Date();
    doc.status = 'active';
    doc.startedAt = doc.startedAt ?? now;
    doc.currentPeriodEnd = rollPeriodEnd(now, interval);
    doc.payment = new mongoose.Types.ObjectId(paymentId);
    doc.cancelledAt = null;
    await doc.save();

    /* Confirmation email — fire-and-forget. activate() is called by
     * the payment webhook (no live request from the seller), so we
     * lean entirely on the seller's stored `lastOrigin` for the
     * email link base URL. Falls back to APP_BASE_URL when not set. */
    void (async () => {
      try {
        const user = await UserModel.findById(doc.user).exec();
        if (!user) return;
        await sendSubscriptionActivatedEmail({
          to: user.email,
          name: user.name,
          planName: plan?.name ?? doc.planSlug,
          periodEnd: doc.currentPeriodEnd,
          userOrigin: user.lastOrigin ?? null,
        });
      } catch (err) {
        logger.warn({ err }, 'subscription activation email skipped');
      }
    })();

    return doc;
  },

  /** Seller-initiated cancel — status flips, currentPeriodEnd stays so
   *  they keep what they paid for until the period rolls. */
  async cancel(
    userId: string,
    ctx: { origin?: string | null } = {},
  ): Promise<SubscriptionDoc> {
    const doc = await this.getCurrent(userId);
    if (!doc) throw new NotFoundError('No subscription found');
    if (doc.status === 'cancelled' || doc.status === 'expired') {
      throw new ConflictError('Subscription is already inactive');
    }
    doc.status = 'cancelled';
    doc.cancelledAt = new Date();
    await doc.save();

    /* Cancellation acknowledgement email. Surfaces the access-until
     * date so the seller knows their grace period. Cancel is always
     * triggered by the user clicking from their browser, so we have
     * a live request origin to use first. */
    void (async () => {
      try {
        const [user, plan] = await Promise.all([
          UserModel.findById(doc.user).exec(),
          subscriptionPlanService.getById(doc.plan.toString()),
        ]);
        if (!user) return;
        await sendSubscriptionCancelledEmail({
          to: user.email,
          name: user.name,
          planName: plan?.name ?? doc.planSlug,
          periodEnd: doc.currentPeriodEnd,
          requestOrigin: ctx.origin ?? null,
          userOrigin: user.lastOrigin ?? null,
        });
      } catch (err) {
        logger.warn({ err }, 'subscription cancel email skipped');
      }
    })();

    return doc;
  },
};
