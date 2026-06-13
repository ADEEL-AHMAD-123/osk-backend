import { z } from 'zod';
import { BILLING_CURRENCIES } from '../payments/billing-currencies';
import { FEATURE_KEYS, PLAN_INTERVALS } from './subscriptionPlan.types';

/**
 * Plan prices must be in one of the platform's billing currencies.
 * The frontend converts these for display via a static FX table, but
 * the stored value is always one we can actually charge against — no
 * runtime FX, no provider mismatch.
 */
const priceSchema = z.object({
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase())
    .refine(
      (s) => (BILLING_CURRENCIES as readonly string[]).includes(s),
      `Currency must be one of: ${BILLING_CURRENCIES.join(', ')}`,
    ),
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
