import { z } from 'zod';
import { PROVIDER_KEYS } from '../pricing/pricing.types';

export const createIntentSchema = z.object({
  propertyId: z.string().min(1),
  provider: z.enum(PROVIDER_KEYS),
});
export type CreateIntentInput = z.infer<typeof createIntentSchema>;
