import express, { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  confirmPayment,
  listAdminPayments,
  listMyPayments,
  makeWebhookHandler,
} from './payment.controller';

/**
 * Payments module presentation layer.
 *
 * Subscription checkout intents are created from inside the
 * subscriptions module (POST /subscriptions/subscribe) so this module
 * only exposes read endpoints, admin confirmation, and provider
 * webhooks. Per-listing intents have been removed.
 *
 * Webhooks need the *raw* request body so providers can verify the
 * signature. We attach `express.raw()` on the webhook routes only — the
 * rest of the module uses the standard JSON parser from the app shell.
 */
export const paymentRoutes = Router();

/* Seller */
paymentRoutes.get('/mine', authenticate, asyncHandler(listMyPayments));

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
