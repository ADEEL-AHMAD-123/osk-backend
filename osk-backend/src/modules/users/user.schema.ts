import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
  phone: z.string().min(6).max(40).optional().or(z.literal('')),
  address: z.string().min(3).max(240).optional().or(z.literal('')),
  city: z.string().min(2).max(80).optional().or(z.literal('')),
  state: z.string().min(2).max(80).optional().or(z.literal('')),
  country: z.string().min(2).max(80).optional().or(z.literal('')),
  companyName: z.string().min(2).max(120).optional().or(z.literal('')),
  companyRegistration: z.string().min(2).max(120).optional().or(z.literal('')),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const userFiltersSchema = z.object({
  role: z.enum(['buyer', 'seller', 'agent', 'admin']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(24),
});
export type UserFilters = z.infer<typeof userFiltersSchema>;
