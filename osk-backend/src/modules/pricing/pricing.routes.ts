import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import { getSettings, updateSettings } from './pricing.controller';

/**
 * Pricing module presentation layer — payment configuration only.
 *  - Public:    GET /pricing/settings  (sellers need to know whether
 *               payments are enabled + which providers are available
 *               and which of those are fully configured)
 *  - Admin:     PATCH /pricing/settings (toggle, providers, creds, bank)
 *
 * Per-listing plans + the resolver have been removed in favour of the
 * subscription model in `modules/subscriptions/`.
 */
export const pricingRoutes = Router();

pricingRoutes.get('/settings', asyncHandler(getSettings));
pricingRoutes.patch(
  '/settings',
  authenticate,
  authorize('admin'),
  asyncHandler(updateSettings),
);
