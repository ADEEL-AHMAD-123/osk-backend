import mongoose from 'mongoose';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../shared/errors';
import type { AuthUser } from '../../shared/middleware/auth';
import { ReviewModel, type ReviewDoc } from './review.model';
import type {
  CreateReviewDto,
  ReviewFilters,
  UpdateReviewDto,
} from './review.schema';

function assertDbReady(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new ServiceUnavailableError(
      'Database unavailable — start MongoDB and try again',
    );
  }
}

export const reviewService = {
  async create(input: CreateReviewDto, actor: AuthUser): Promise<ReviewDoc> {
    assertDbReady();
    if (!mongoose.isValidObjectId(input.propertyId)) {
      throw new NotFoundError('Property not found');
    }
    try {
      return await ReviewModel.create({
        ...input,
        authorId: actor.id,
      });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        throw new ConflictError('You have already reviewed this property');
      }
      throw err;
    }
  },

  async list(
    filters: ReviewFilters,
  ): Promise<{ items: ReviewDoc[]; total: number }> {
    assertDbReady();
    const query: Record<string, unknown> = {};
    if (filters.propertyId && mongoose.isValidObjectId(filters.propertyId)) {
      query.propertyId = filters.propertyId;
    }
    query.status = filters.status ?? 'approved';
    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
      ReviewModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      ReviewModel.countDocuments(query),
    ]);
    return { items, total };
  },

  async update(
    id: string,
    patch: UpdateReviewDto,
    actor: AuthUser,
  ): Promise<ReviewDoc> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Review not found');
    }
    const review = await ReviewModel.findById(id).exec();
    if (!review) throw new NotFoundError('Review not found');
    if (
      review.authorId.toString() !== actor.id &&
      actor.role !== 'admin'
    ) {
      throw new ForbiddenError('You can only edit your own review');
    }
    Object.assign(review, patch);
    return review.save();
  },

  async remove(id: string, actor: AuthUser): Promise<void> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Review not found');
    }
    const review = await ReviewModel.findById(id).exec();
    if (!review) throw new NotFoundError('Review not found');
    if (
      review.authorId.toString() !== actor.id &&
      actor.role !== 'admin'
    ) {
      throw new ForbiddenError('You can only delete your own review');
    }
    await review.deleteOne();
  },
};
