import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate } from '../../shared/middleware/auth';
import {
  listNotifications,
  markAllRead,
  markRead,
} from './notification.controller';

export const notificationRoutes = Router();

notificationRoutes.get('/', authenticate, asyncHandler(listNotifications));
notificationRoutes.post('/read-all', authenticate, asyncHandler(markAllRead));
notificationRoutes.post('/:id/read', authenticate, asyncHandler(markRead));
