import { Schema, model, type Document, type Types } from 'mongoose';
import {
  LISTING_KINDS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type ContactCapabilities,
  type ListingKind,
  type PropertyStatus,
  type PropertyType,
} from './property.types';

export interface MediaSubDoc {
  _id: Types.ObjectId;
  url: string;
  kind: 'image' | 'video' | 'floorplan';
  width?: number;
  height?: number;
}

export interface PropertyDoc extends Document {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  type: PropertyType;
  listingKind: ListingKind;
  status: PropertyStatus;
  price: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  areaSqft?: number;
  locality: string;
  city: string;
  /** ISO 3166-1 alpha-2 — e.g. 'US', 'CA', 'GB'. Defaults to 'US'. */
  country: string;
  thumbnail: string;
  isFeatured: boolean;
  location: { type: 'Point'; coordinates: [number, number] };
  contactCapabilities: ContactCapabilities;
  description: string;
  amenities: string[];
  media: Types.DocumentArray<MediaSubDoc>;
  yearBuilt?: number;
  owner: Types.ObjectId;
  agent?: Types.ObjectId;
  /** Total public detail-page views — incremented via /properties/:id/view. */
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<MediaSubDoc>(
  {
    url: { type: String, required: true },
    kind: { type: String, enum: ['image', 'video', 'floorplan'], default: 'image' },
    width: Number,
    height: Number,
  },
  { _id: true },
);

const propertySchema = new Schema<PropertyDoc>(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: PROPERTY_TYPES, required: true },
    listingKind: { type: String, enum: LISTING_KINDS, required: true },
    status: { type: String, enum: PROPERTY_STATUSES, default: 'draft' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true },
    bedrooms: { type: Number, min: 0 },
    bathrooms: { type: Number, min: 0 },
    areaSqft: { type: Number, min: 0 },
    locality: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    country: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 2,
      default: 'US',
      index: true,
    },
    thumbnail: { type: String, required: true },
    isFeatured: { type: Boolean, default: false },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    contactCapabilities: {
      chat: { type: Boolean, default: true },
      call: {
        enabled: { type: Boolean, default: true },
        masked: { type: Boolean, default: true },
      },
      whatsapp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
    description: { type: String, required: true },
    amenities: { type: [String], default: [] },
    media: { type: [mediaSchema], default: [] },
    yearBuilt: Number,
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    agent: { type: Schema.Types.ObjectId, ref: 'User' },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// — Indexes (blueprint §6) —
// slug unique index is created by `unique: true` above.
propertySchema.index({ title: 'text', description: 'text', locality: 'text' });
propertySchema.index({ location: '2dsphere' });
propertySchema.index({ type: 1, status: 1, price: 1 });
propertySchema.index({ listingKind: 1, status: 1, createdAt: -1 });
propertySchema.index({ status: 1, isFeatured: -1, createdAt: -1 });
propertySchema.index({ owner: 1, status: 1 });

export const PropertyModel = model<PropertyDoc>('Property', propertySchema);
