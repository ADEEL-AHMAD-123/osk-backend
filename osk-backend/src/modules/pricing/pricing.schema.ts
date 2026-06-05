import { z } from 'zod';
import { LISTING_KINDS, PROPERTY_TYPES } from '../properties/property.types';
import { PROVIDER_KEYS } from './pricing.types';

/** Plan property type / listing kind admit '*' as a wildcard. */
const planPropertyType = z.union([
  z.enum(PROPERTY_TYPES),
  z.literal('*'),
]);
const planListingKind = z.union([
  z.enum(LISTING_KINDS),
  z.literal('*'),
]);

/** ISO-2 (uppercased) or '*' (any). */
const planCountry = z
  .string()
  .min(1)
  .max(2)
  .transform((v) => v.toUpperCase());

export const createPlanSchema = z.object({
  name: z.string().min(2).max(80),
  propertyType: planPropertyType.default('*'),
  listingKind: planListingKind.default('*'),
  country: planCountry.default('*'),
  featured: z.boolean().default(false),
  price: z.number().nonnegative(),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase())
    .default('USD'),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = createPlanSchema.partial();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

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

export const resolveSchema = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  listingKind: z.enum(LISTING_KINDS),
  country: z
    .string()
    .length(2)
    .transform((v) => v.toUpperCase()),
  featured: z.coerce.boolean().default(false),
});
export type ResolveInput = z.infer<typeof resolveSchema>;
