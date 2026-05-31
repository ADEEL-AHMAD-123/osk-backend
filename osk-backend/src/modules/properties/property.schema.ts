import { z } from 'zod';
import { LISTING_KINDS, PROPERTY_TYPES } from './property.types';

/** Listing query — filter + sort + pagination. */
export const propertyFiltersSchema = z.object({
  q: z.string().optional(),
  type: z.enum(PROPERTY_TYPES).optional(),
  listingKind: z.enum(LISTING_KINDS).optional(),
  city: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  isFeatured: z.coerce.boolean().optional(),
  sort: z
    .enum(['-createdAt', 'createdAt', 'price', '-price'])
    .default('-createdAt'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(24),
});
export type PropertyFilters = z.infer<typeof propertyFiltersSchema>;

const locationSchema = z.object({
  type: z.literal('Point').default('Point'),
  coordinates: z.tuple([z.number(), z.number()]), // [lng, lat]
});

const mediaItemSchema = z.object({
  url: z.string().min(1).max(500),
  kind: z.enum(['image', 'video', 'floorplan']).default('image'),
});

/** Create payload — server assigns slug, owner and status. */
export const createPropertySchema = z.object({
  title: z.string().min(6).max(140),
  description: z.string().min(30).max(4000),
  type: z.enum(PROPERTY_TYPES),
  listingKind: z.enum(LISTING_KINDS),
  price: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  areaSqft: z.number().positive().optional(),
  locality: z.string().min(2).max(120),
  city: z.string().min(2).max(120),
  amenities: z.array(z.string()).default([]),
  location: locationSchema,
  /** Optional — first image used as thumbnail. */
  media: z.array(mediaItemSchema).max(20).optional(),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

/** Update payload — every field optional. */
export const updatePropertySchema = createPropertySchema.partial();
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
