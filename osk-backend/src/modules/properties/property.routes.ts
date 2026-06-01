import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  approveProperty,
  createProperty,
  getMyAnalytics,
  getProperty,
  listMyProperties,
  listProperties,
  listPropertiesInViewport,
  markPropertySold,
  recordPropertyView,
  rejectProperty,
  reopenProperty,
  submitProperty,
  updateProperty,
} from './property.controller';

/**
 * Properties module — presentation layer.
 * Public reads; owner-scoped writes; admin moderation. Lifecycle:
 * draft → (submit) → pending-review → (approve) published / (reject) rejected.
 */
export const propertyRoutes = Router();

/* View counter: cheap & frequent, so it gets its own bucket so a hot
 * listing's traffic doesn't starve the rest of the API. */
const viewLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Public reads — specific paths declared before the `/:slug` catch-all.
propertyRoutes.get('/', asyncHandler(listProperties));
propertyRoutes.get('/map', asyncHandler(listPropertiesInViewport));
propertyRoutes.get('/mine', authenticate, asyncHandler(listMyProperties));
propertyRoutes.get(
  '/me/analytics',
  authenticate,
  asyncHandler(getMyAnalytics),
);
propertyRoutes.post('/:id/view', viewLimiter, asyncHandler(recordPropertyView));
propertyRoutes.get('/:slug', asyncHandler(getProperty));

// Owner / agent writes.
propertyRoutes.post(
  '/',
  authenticate,
  authorize('seller', 'agent', 'admin'),
  asyncHandler(createProperty),
);
propertyRoutes.patch(
  '/:id',
  authenticate,
  authorize('seller', 'agent', 'admin'),
  asyncHandler(updateProperty),
);
propertyRoutes.post(
  '/:id/submit',
  authenticate,
  authorize('seller', 'agent', 'admin'),
  asyncHandler(submitProperty),
);
propertyRoutes.post(
  '/:id/mark-sold',
  authenticate,
  authorize('seller', 'agent', 'admin'),
  asyncHandler(markPropertySold),
);
propertyRoutes.post(
  '/:id/reopen',
  authenticate,
  authorize('seller', 'agent', 'admin'),
  asyncHandler(reopenProperty),
);

// Admin moderation.
propertyRoutes.post(
  '/:id/approve',
  authenticate,
  authorize('admin'),
  asyncHandler(approveProperty),
);
propertyRoutes.post(
  '/:id/reject',
  authenticate,
  authorize('admin'),
  asyncHandler(rejectProperty),
);
