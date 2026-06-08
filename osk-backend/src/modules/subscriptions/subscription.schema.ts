import { z } from 'zod';
import { PROVIDER_KEYS } from '../pricing/pricing.types';

/** Body for POST /subscriptions/subscribe. */
export const subscribeSchema = z.object({
  planId: z.string().min(1),
  /** Optional currency hint — used to detect free vs paid. Defaults USD. */
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase())
    .optional(),
  /** Provider only required when the plan is paid. */
  provider: z.enum(PROVIDER_KEYS).optional(),
});
export type SubscribeInput = z.infer<typeof subscribeSchema>;
