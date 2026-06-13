import { z } from 'zod';
import { PROVIDER_KEYS } from './pricing.types';

/**
 * Per-provider credential patch. Every field is optional; the admin can
 * update one key at a time. A field set to '' clears the saved value.
 * Max length is generous (provider keys vary 32–256 chars).
 */
const secretField = z.string().max(512).optional();

const stripePatch = z
  .object({
    secretKey: secretField,
    webhookSecret: secretField,
  })
  .partial();

const paypalPatch = z
  .object({
    clientId: secretField,
    clientSecret: secretField,
    apiBase: z
      .string()
      .url()
      .max(200)
      .optional()
      .or(z.literal('')),
    webhookId: secretField,
  })
  .partial();

const paystackPatch = z
  .object({
    secretKey: secretField,
  })
  .partial();

export const updateSettingsSchema = z.object({
  paymentsEnabled: z.boolean().optional(),
  enabledProviders: z.array(z.enum(PROVIDER_KEYS)).optional(),
  bankInstructions: z.string().max(2000).optional(),
  stripe: stripePatch.optional(),
  paypal: paypalPatch.optional(),
  paystack: paystackPatch.optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
