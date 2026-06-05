import { Schema, model, type Document, type Types } from 'mongoose';
import { LISTING_KINDS, PROPERTY_TYPES } from '../properties/property.types';

/**
 * PricingPlan — server-defined rule. Each plan declares a price for a
 * (propertyType, listingKind, country, featured) slice; '*' acts as a
 * wildcard so admins can write broad fallbacks.
 */

export interface PricingPlanDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  /** PropertyType or '*' (any). */
  propertyType: string;
  /** ListingKind or '*' (any). */
  listingKind: string;
  /** ISO-2 uppercased country code or '*' (any). */
  country: string;
  /** True when the plan is the featured-upgrade price. */
  featured: boolean;
  price: number;
  currency: string;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/* Allow '*' alongside the canonical enums on the model. */
const propertyTypeValues = [...PROPERTY_TYPES, '*'] as const;
const listingKindValues = [...LISTING_KINDS, '*'] as const;

const pricingPlanSchema = new Schema<PricingPlanDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    propertyType: {
      type: String,
      enum: propertyTypeValues,
      required: true,
      default: '*',
    },
    listingKind: {
      type: String,
      enum: listingKindValues,
      required: true,
      default: '*',
    },
    country: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: '*',
      /* '*' (1 char) or ISO-2 (2 chars) — allow both. */
      minlength: 1,
      maxlength: 2,
    },
    featured: { type: Boolean, default: false },
    price: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      length: 3,
      default: 'USD',
    },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/* Compound index for resolver query speed. */
pricingPlanSchema.index({
  active: 1,
  featured: 1,
  propertyType: 1,
  listingKind: 1,
  country: 1,
  priority: -1,
});

export const PricingPlanModel = model<PricingPlanDoc>(
  'PricingPlan',
  pricingPlanSchema,
);
