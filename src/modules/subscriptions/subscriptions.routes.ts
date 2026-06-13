import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  cancelSubscription,
  createPlan,
  deletePlan,
  getMySubscription,
  listPlansAdmin,
  listPlansPublic,
  subscribe,
  updatePlan,
} from './subscriptions.controller';

/* ─── Catalog routes (mounted at /subscription-plans) ──────────────── */
export const subscriptionPlanRoutes = Router();
subscriptionPlanRoutes.get('/', asyncHandler(listPlansPublic));
/* Admin section under /subscription-plans/admin to avoid path collisions
 * with a future :id route. */
subscriptionPlanRoutes.get(
  '/admin',
  authenticate,
  authorize('admin'),
  asyncHandler(listPlansAdmin),
);
subscriptionPlanRoutes.post(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(createPlan),
);
subscriptionPlanRoutes.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(updatePlan),
);
subscriptionPlanRoutes.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(deletePlan),
);

/* ─── User subscription routes (mounted at /subscriptions) ────────── */
export const subscriptionRoutes = Router();
subscriptionRoutes.get('/me', authenticate, asyncHandler(getMySubscription));
subscriptionRoutes.post('/subscribe', authenticate, asyncHandler(subscribe));
subscriptionRoutes.post(
  '/cancel',
  authenticate,
  asyncHandler(cancelSubscription),
);
