import express, { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  confirmPayment,
  createIntent,
  listAdminPayments,
  listMyPayments,
  listPropertyPayments,
  makeWebhookHandler,
} from './payment.controller';

/**
 * Payments module presentation layer.
 *
 * Webhooks need the *raw* request body so providers can verify the
 * signature. We attach `express.raw()` on the webhook routes only — the
 * rest of the module uses the standard JSON parser from the app shell.
 */
export const paymentRoutes = Router();

/* Seller */
paymentRoutes.post('/intent', authenticate, asyncHandler(createIntent));
paymentRoutes.get('/mine', authenticate, asyncHandler(listMyPayments));
paymentRoutes.get(
  '/by-property/:propertyId',
  authenticate,
  asyncHandler(listPropertyPayments),
);

/* Admin */
paymentRoutes.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(listAdminPayments),
);
paymentRoutes.post(
  '/:id/confirm',
  authenticate,
  authorize('admin'),
  asyncHandler(confirmPayment),
);

/* Webhooks — raw body parser so signature verification can run. */
const rawJson = express.raw({ type: 'application/json' });
paymentRoutes.post(
  '/webhook/stripe',
  rawJson,
  asyncHandler(makeWebhookHandler('stripe')),
);
paymentRoutes.post(
  '/webhook/paypal',
  rawJson,
  asyncHandler(makeWebhookHandler('paypal')),
);
paymentRoutes.post(
  '/webhook/paystack',
  rawJson,
  asyncHandler(makeWebhookHandler('paystack')),
);
