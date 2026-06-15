import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  getWhatsAppLink,
  listContactMessages,
  logCallIntent,
  requestCallback,
  submitContactGeneral,
  submitInquiry,
  updateContactMessage,
} from './contact.controller';

/**
 * Contact-channels module — presentation layer.
 * Inquiry/callback endpoints carry a stricter rate limit (anti-spam).
 */
export const contactRoutes = Router();

// Tight limiter for the spam-prone write endpoints.
const contactLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

contactRoutes.post('/inquiry', contactLimiter, asyncHandler(submitInquiry));
contactRoutes.post('/callback-request', contactLimiter, asyncHandler(requestCallback));
contactRoutes.post('/call-intent', asyncHandler(logCallIntent));
contactRoutes.post('/general', contactLimiter, asyncHandler(submitContactGeneral));
contactRoutes.get('/whatsapp-link/:propertyId', asyncHandler(getWhatsAppLink));

/* Admin-only — list + mark replied/closed. Mounted under /contact so
 * the contact module owns its own admin routes; auth + role gate
 * apply per-route. */
export const contactAdminRoutes = Router();
contactAdminRoutes.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(listContactMessages),
);
contactAdminRoutes.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(updateContactMessage),
);
