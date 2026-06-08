import type { RequestHandler } from 'express';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import type { AuthUser } from '../../shared/middleware/auth';
import { paymentService } from '../payments/payment.service';
import {
  createPlanSchema,
  updatePlanSchema,
} from './subscriptionPlan.schema';
import { subscriptionPlanService } from './subscriptionPlan.service';
import { subscribeSchema } from './subscription.schema';
import { subscriptionService } from './subscription.service';
import { toSubscriptionDTO } from './subscription.mapper';

/* ─── Plans (catalog) ─────────────────────────────────────────────── */

export const listPlansPublic: RequestHandler = async (_req, res) => {
  sendSuccess(res, await subscriptionPlanService.listPublic());
};

export const listPlansAdmin: RequestHandler = async (_req, res) => {
  sendSuccess(res, await subscriptionPlanService.listAdmin());
};

export const createPlan: RequestHandler = async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(res, await subscriptionPlanService.create(parsed.data), {
    status: 201,
  });
};

export const updatePlan: RequestHandler = async (req, res) => {
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(
    res,
    await subscriptionPlanService.update(req.params.id!, parsed.data),
  );
};

export const deletePlan: RequestHandler = async (req, res) => {
  await subscriptionPlanService.delete(req.params.id!);
  sendSuccess(res, { id: req.params.id });
};

/* ─── Subscriptions (per-user) ───────────────────────────────────── */

export const getMySubscription: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  sendSuccess(res, await subscriptionService.getCurrentDTO(req.user.id));
};

/**
 * Subscribe / change plan. For free plans the response is the activated
 * subscription DTO; for paid plans it returns the pending subscription
 * plus a payment intent that the seller can complete via the existing
 * payments flow. The seller is expected to redirect to checkout when
 * the response carries a `redirectUrl`.
 *
 * The actual billing (provider, currency, amount) is decided by
 * `subscriptionService.subscribe` using `provider` + the user's
 * preferred currency hint — never the user's raw locale currency, so
 * the request can never pin an unsupported pair.
 */
export const subscribe: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const { doc, checkout } = await subscriptionService.subscribe(
    req.user.id,
    parsed.data.planId,
    {
      provider: parsed.data.provider,
      preferredCurrency: parsed.data.currency,
    },
  );

  /* Free path: already 'active'. Just return the DTO. */
  if (doc.status === 'active' || !checkout) {
    sendSuccess(res, { subscription: toSubscriptionDTO(doc) }, { status: 201 });
    return;
  }

  /* Paid path — `checkout` is the (provider, billingCurrency, amount)
   * the service resolved. Fire the intent so the seller gets a
   * redirect URL in this same response. */
  const plan = await subscriptionPlanService.getById(parsed.data.planId);

  const intent = await paymentService.createSubscriptionIntent(
    req.user as AuthUser,
    doc._id.toString(),
    checkout.provider,
    checkout.amount,
    checkout.currency,
    plan?.name ?? 'subscription',
    typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
  );

  sendSuccess(
    res,
    {
      subscription: toSubscriptionDTO(doc),
      payment: intent.payment,
      redirectUrl: intent.redirectUrl,
      /* Echo back the actual billing pair — the frontend renders
       * "Billed at X Y" on the success page from this. */
      billing: {
        provider: checkout.provider,
        currency: checkout.currency,
        amount: checkout.amount,
      },
    },
    { status: 201 },
  );
};

export const cancelSubscription: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const doc = await subscriptionService.cancel((req.user as AuthUser).id);
  sendSuccess(res, toSubscriptionDTO(doc));
};
