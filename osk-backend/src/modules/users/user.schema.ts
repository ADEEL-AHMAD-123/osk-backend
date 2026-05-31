import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const userFiltersSchema = z.object({
  role: z.enum(['buyer', 'seller', 'agent', 'admin']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(24),
});
export type UserFilters = z.infer<typeof userFiltersSchema>;
