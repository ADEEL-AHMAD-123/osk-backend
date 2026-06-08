import { Router } from 'express';
import { healthRoutes } from './health/health.routes';
import { authRoutes } from './auth/auth.routes';
import { propertyRoutes } from './properties/property.routes';
import { contactRoutes } from './contact/contact.routes';
import { inquiryRoutes } from './inquiries/inquiry.routes';
import { userRoutes } from './users/user.routes';
import { agentRoutes } from './agents/agent.routes';
import { reviewRoutes } from './reviews/review.routes';
import { notificationRoutes } from './notifications/notification.routes';
import { marketingRoutes } from './marketing/marketing.routes';
import { threadRoutes } from './threads/thread.routes';
import { mediaRoutes } from './media/media.routes';
import { adminRoutes } from './admin/admin.routes';
import { settingsRoutes } from './settings/settings.routes';
import { pricingRoutes } from './pricing/pricing.routes';
import { paymentRoutes } from './payments/payment.routes';
import {
  subscriptionPlanRoutes,
  subscriptionRoutes,
} from './subscriptions/subscriptions.routes';

/**
 * Module registry — the ONE place modules are wired into the API. To add a
 * domain module: build its routes file, then add a single line here.
 */
export function registerModules(): Router {
  const router = Router();

  router.use('/health', healthRoutes);
  router.use('/properties', propertyRoutes);
  router.use('/contact', contactRoutes);
  router.use('/auth', authRoutes);
  router.use('/inquiries', inquiryRoutes);
  router.use('/users', userRoutes);
  router.use('/agents', agentRoutes);
  router.use('/reviews', reviewRoutes);
  router.use('/notifications', notificationRoutes);
  router.use('/marketing', marketingRoutes);
  router.use('/threads', threadRoutes);
  router.use('/media', mediaRoutes);
  router.use('/admin', adminRoutes);
  router.use('/settings', settingsRoutes);
  router.use('/pricing', pricingRoutes);
  router.use('/payments', paymentRoutes);
  router.use('/subscription-plans', subscriptionPlanRoutes);
  router.use('/subscriptions', subscriptionRoutes);

  return router;
}
