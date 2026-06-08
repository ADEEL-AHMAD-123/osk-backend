import { z } from 'zod';
import { FEATURE_KEYS, PLAN_INTERVALS } from './subscriptionPlan.types';

const priceSchema = z.object({
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
  amount: z.number().nonnegative(),
});

const featureSchema = z.object({
  label: z.string().min(1).max(80),
  included: z.boolean().default(true),
  key: z.enum(FEATURE_KEYS).optional(),
  /* `null` = unlimited; positive number = capped; omit = boolean feature. */
  limit: z.number().int().min(0).nullable().optional(),
});

export const createPlanSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes only')
    .transform((s) => s.toLowerCase()),
  name: z.string().min(2).max(40),
  tagline: z.string().max(140).default(''),
  prices: z.array(priceSchema).default([]),
  interval: z.enum(PLAN_INTERVALS).default('month'),
  features: z.array(featureSchema).default([]),
  sortOrder: z.number().int().default(0),
  highlight: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = createPlanSchema.partial();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
