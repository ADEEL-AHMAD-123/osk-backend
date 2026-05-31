import type { RequestHandler } from 'express';
import { ValidationError } from '../../shared/errors';
import { sendSuccess, buildMeta } from '../../shared/response';
import { reviewService } from './review.service';
import type { ReviewDoc } from './review.model';
import {
  createReviewSchema,
  reviewFiltersSchema,
  updateReviewSchema,
} from './review.schema';

interface ReviewDTO {
  id: string;
  propertyId: string;
  authorId: string;
  rating: number;
  title?: string;
  body: string;
  status: ReviewDoc['status'];
  createdAt: string;
  updatedAt: string;
}

function toDTO(doc: ReviewDoc): ReviewDTO {
  return {
    id: doc._id.toString(),
    propertyId: doc.propertyId.toString(),
    authorId: doc.authorId.toString(),
    rating: doc.rating,
    title: doc.title,
    body: doc.body,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const createReview: RequestHandler = async (req, res) => {
  const parsed = createReviewSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const review = await reviewService.create(parsed.data, req.user!);
  sendSuccess(res, toDTO(review), { status: 201 });
};

export const listReviews: RequestHandler = async (req, res) => {
  const parsed = reviewFiltersSchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const { items, total } = await reviewService.list(parsed.data);
  sendSuccess(
    res,
    items.map(toDTO),
    { meta: buildMeta(parsed.data.page, parsed.data.limit, total) },
  );
};

export const updateReview: RequestHandler = async (req, res) => {
  const parsed = updateReviewSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const review = await reviewService.update(
    req.params.id ?? '',
    parsed.data,
    req.user!,
  );
  sendSuccess(res, toDTO(review));
};

export const deleteReview: RequestHandler = async (req, res) => {
  await reviewService.remove(req.params.id ?? '', req.user!);
  sendSuccess(res, { ok: true });
};
