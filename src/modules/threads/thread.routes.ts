import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate } from '../../shared/middleware/auth';
import {
  getThread,
  listMessages,
  listThreads,
  sendMessage,
  startThread,
} from './thread.controller';

export const threadRoutes = Router();

threadRoutes.use(authenticate);

threadRoutes.get('/', asyncHandler(listThreads));
threadRoutes.post('/', asyncHandler(startThread));
threadRoutes.get('/:id', asyncHandler(getThread));
threadRoutes.get('/:id/messages', asyncHandler(listMessages));
threadRoutes.post('/:id/messages', asyncHandler(sendMessage));
