import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate } from '../../shared/middleware/auth';
import {
  createCallbackInquiry,
  createEmailInquiry,
  listInquiries,
  updateInquiry,
} from './inquiry.controller';

export const inquiryRoutes = Router();

/* Owner / admin dashboard */
inquiryRoutes.get('/', authenticate, asyncHandler(listInquiries));
inquiryRoutes.patch('/:id', authenticate, asyncHandler(updateInquiry));

/* Public create endpoints — also reachable via /contact/* for ergonomics */
inquiryRoutes.post('/', asyncHandler(createEmailInquiry));
inquiryRoutes.post('/callback', asyncHandler(createCallbackInquiry));
