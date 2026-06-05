import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  createPlan,
  deletePlan,
  getSettings,
  listPlans,
  resolvePrice,
  updatePlan,
  updateSettings,
} from './pricing.controller';

/**
 * Pricing module presentation layer.
 *  - Public:    GET  /pricing/settings  (sellers need to know whether
 *               payments are enabled + which providers are available)
 *  - Authed:    POST /pricing/resolve   (seller previews their listing's price)
 *  - Admin:     /pricing/plans CRUD + PATCH /pricing/settings
 */
export const pricingRoutes = Router();

/* Public + authed */
pricingRoutes.get('/settings', asyncHandler(getSettings));
pricingRoutes.post(
  '/resolve',
  authenticate,
  asyncHandler(resolvePrice),
);

/* Admin */
pricingRoutes.get(
  '/plans',
  authenticate,
  authorize('admin'),
  asyncHandler(listPlans),
);
pricingRoutes.post(
  '/plans',
  authenticate,
  authorize('admin'),
  asyncHandler(createPlan),
);
pricingRoutes.patch(
  '/plans/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(updatePlan),
);
pricingRoutes.delete(
  '/plans/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(deletePlan),
);
pricingRoutes.patch(
  '/settings',
  authenticate,
  authorize('admin'),
  asyncHandler(updateSettings),
);
