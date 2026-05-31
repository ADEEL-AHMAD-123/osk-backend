/** Properties domain types — shared by the model, service and seed. */

export const PROPERTY_TYPES = ['home', 'plot', 'commercial', 'rental'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const LISTING_KINDS = ['new-project', 'resale'] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export const PROPERTY_STATUSES = [
  'draft',
  'pending-review',
  'approved',
  'rejected',
  'published',
  'sold',
  'archived',
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface ContactCapabilities {
  chat: boolean;
  call: { enabled: boolean; masked: boolean };
  whatsapp: boolean;
  email: boolean;
  contactNumber?: string; // WhatsApp and call number
}

export interface PropertyMedia {
  id: string;
  url: string;
  kind: 'image' | 'video' | 'floorplan';
  width?: number;
  height?: number;
}

/** Property as returned to clients (mirrors osk-frontend contracts). */
export interface PropertyDTO {
  id: string;
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
  thumbnail: string;
  isFeatured: boolean;
  location: GeoPoint;
  contactCapabilities: ContactCapabilities;
  description: string;
  amenities: string[];
  media: PropertyMedia[];
  yearBuilt?: number;
  ownerId: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Shape of a seed property (owner is assigned at seed time). */
export type PropertySeed = Omit<
  PropertyDTO,
  'id' | 'ownerId' | 'agentId' | 'createdAt' | 'updatedAt' | 'media'
> & {
  media: Array<Omit<PropertyMedia, 'id'>>;
};
