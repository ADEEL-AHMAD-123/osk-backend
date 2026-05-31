import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import { listUsers } from '../users/user.controller';
import {
  approvePropertyAdmin,
  deleteReview,
  getOverview,
  impersonateUser,
  listAuditLogs,
  listPendingProperties,
  listReviewsForModeration,
  rejectPropertyAdmin,
  setPropertyFeatured,
  updateUser,
} from './admin.controller';
import { patchAdminSettings } from '../settings/settings.admin.controller';

/**
 * Admin module. Every route requires authentication + the 'admin' role.
 * Read endpoints serve the admin dashboard; mutations gate user roles,
 * property moderation, and review takedowns.
 */
export const adminRoutes = Router();

adminRoutes.use(authenticate, authorize('admin'));

/* ─── overview / metrics ───────────────────────────────────────────────── */
adminRoutes.get('/overview', asyncHandler(getOverview));

/* ─── property moderation queue ────────────────────────────────────────── */
adminRoutes.get('/properties/pending', asyncHandler(listPendingProperties));
adminRoutes.post('/properties/:id/approve', asyncHandler(approvePropertyAdmin));
adminRoutes.post('/properties/:id/reject', asyncHandler(rejectPropertyAdmin));
adminRoutes.patch(
  '/properties/:id/featured',
  asyncHandler(setPropertyFeatured),
);

/* ─── user management ──────────────────────────────────────────────────── */
adminRoutes.get('/users', asyncHandler(listUsers));
adminRoutes.patch('/users/:id', asyncHandler(updateUser));
adminRoutes.post('/users/:id/impersonate', asyncHandler(impersonateUser));

/* ─── review moderation ────────────────────────────────────────────────── */
adminRoutes.get('/reviews', asyncHandler(listReviewsForModeration));
adminRoutes.delete('/reviews/:id', asyncHandler(deleteReview));

/* ─── audit log ────────────────────────────────────────────────────────── */
adminRoutes.get('/audit-logs', asyncHandler(listAuditLogs));

/* ─── admin settings ───────────────────────────────────────────────────── */
adminRoutes.patch('/settings', asyncHandler(patchAdminSettings));
