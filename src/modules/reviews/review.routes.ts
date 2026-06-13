import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate } from '../../shared/middleware/auth';
import {
  createReview,
  deleteReview,
  listReviews,
  updateReview,
} from './review.controller';

export const reviewRoutes = Router();

reviewRoutes.get('/', asyncHandler(listReviews));
reviewRoutes.post('/', authenticate, asyncHandler(createReview));
reviewRoutes.patch('/:id', authenticate, asyncHandler(updateReview));
reviewRoutes.delete('/:id', authenticate, asyncHandler(deleteReview));
