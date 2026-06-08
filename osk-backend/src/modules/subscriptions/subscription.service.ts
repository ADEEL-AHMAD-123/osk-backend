import mongoose from 'mongoose';
import {
  ConflictError,
  NotFoundError,
} from '../../shared/errors';
import { SubscriptionModel, type SubscriptionDoc } from './subscription.model';
import { toSubscriptionDTO } from './subscription.mapper';
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
   * Start a new subscription for `userId` on plan `planId`. Replaces any
   * existing row (no parallel actives). If the plan is FREE (zero price
   * in the chosen currency) the subscription is activated immediately;
   * otherwise the caller (payment service) will activate it on payment.
   */
  async subscribe(
    userId: string,
    planId: string,
    currency = 'USD',
  ): Promise<SubscriptionDoc> {
    if (!mongoose.isValidObjectId(planId)) {
      throw new NotFoundError('Plan not found');
    }
    const plan = await subscriptionPlanService.getById(planId);
    if (!plan || !plan.active) {
      throw new NotFoundError('Plan not available');
    }

    /* Free path: zero-amount plan activates immediately. */
    const price = plan.prices.find(
      (p) => p.currency === currency.toUpperCase(),
    );
    const isFree =
      plan.prices.length === 0 || (price && price.amount === 0);

    /* Replace any existing subscription row — keeps things simple, the
     * history table is the Payments collection. */
    const existing = await this.getCurrent(userId);
    if (existing && existing.planSlug === plan.slug && existing.status === 'active') {
      throw new ConflictError('You are already subscribed to this plan');
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
    } else {
      doc.status = 'pending-payment';
      /* Period starts on payment success, not here. */
    }
    await doc.save();
    return doc;
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
    return doc;
  },

  /** Seller-initiated cancel — status flips, currentPeriodEnd stays so
   *  they keep what they paid for until the period rolls. */
  async cancel(userId: string): Promise<SubscriptionDoc> {
    const doc = await this.getCurrent(userId);
    if (!doc) throw new NotFoundError('No subscription found');
    if (doc.status === 'cancelled' || doc.status === 'expired') {
      throw new ConflictError('Subscription is already inactive');
    }
    doc.status = 'cancelled';
    doc.cancelledAt = new Date();
    await doc.save();
    return doc;
  },
};
