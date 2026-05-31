import { z } from 'zod';

export const createReviewSchema = z.object({
  propertyId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().min(10).max(2000),
});
export type CreateReviewDto = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(120).optional(),
  body: z.string().min(10).max(2000).optional(),
});
export type UpdateReviewDto = z.infer<typeof updateReviewSchema>;

export const reviewFiltersSchema = z.object({
  propertyId: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(24),
});
export type ReviewFilters = z.infer<typeof reviewFiltersSchema>;
