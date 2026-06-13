import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../shared/asyncHandler';
import {
  getWhatsAppLink,
  logCallIntent,
  requestCallback,
  submitInquiry,
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
contactRoutes.get('/whatsapp-link/:propertyId', asyncHandler(getWhatsAppLink));
