import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  getGoogleSettings,
  getPublicConfig,
  googleCallback,
  startGoogle,
  updateGoogleSettings,
} from './googleAuth.controller';

/**
 * Three surfaces:
 *
 *   Public OAuth:  /auth/google/config        (no auth)
 *                  /auth/google/start         (302 → Google)
 *                  /auth/google/callback      (302 ← Google)
 *
 *   Admin:         /admin/auth/google         (auth + admin role)
 */
export const googleAuthPublicRoutes = Router();
googleAuthPublicRoutes.get('/config', asyncHandler(getPublicConfig));
googleAuthPublicRoutes.get('/start', asyncHandler(startGoogle));
googleAuthPublicRoutes.get('/callback', asyncHandler(googleCallback));

export const googleAuthAdminRoutes = Router();
googleAuthAdminRoutes.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(getGoogleSettings),
);
googleAuthAdminRoutes.patch(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(updateGoogleSettings),
);
