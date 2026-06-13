import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  getCaptchaSettings,
  getPublicConfig,
  updateCaptchaSettings,
} from './captcha.controller';

/**
 * Two surfaces:
 *  - Public:  GET /captcha/config       (no auth)
 *  - Admin:   GET/PATCH /admin/captcha  (auth + admin role)
 */
export const captchaPublicRoutes = Router();
captchaPublicRoutes.get('/config', asyncHandler(getPublicConfig));

export const captchaAdminRoutes = Router();
captchaAdminRoutes.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(getCaptchaSettings),
);
captchaAdminRoutes.patch(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(updateCaptchaSettings),
);
