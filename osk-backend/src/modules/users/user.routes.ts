import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import { getMe, listUsers, updateMe } from './user.controller';

export const userRoutes = Router();

userRoutes.get('/me', authenticate, asyncHandler(getMe));
userRoutes.patch('/me', authenticate, asyncHandler(updateMe));
userRoutes.get('/', authenticate, authorize('admin'), asyncHandler(listUsers));
