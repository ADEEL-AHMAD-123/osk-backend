import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import {
  getEmailSettings,
  previewEmail,
  sendTestEmail,
  updateEmailSettings,
} from './email.controller';

/**
 * Email module presentation layer — admin-only. Everything is mounted
 * under /admin/email so it sits next to the other operator controls.
 */
export const emailRoutes = Router();

emailRoutes.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(getEmailSettings),
);
emailRoutes.patch(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(updateEmailSettings),
);
emailRoutes.post(
  '/test',
  authenticate,
  authorize('admin'),
  asyncHandler(sendTestEmail),
);
emailRoutes.get(
  '/preview',
  authenticate,
  authorize('admin'),
  asyncHandler(previewEmail),
);
