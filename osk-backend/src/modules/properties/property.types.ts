/** Properties domain types — shared by the model, service and seed. */

export const PROPERTY_TYPES = ['home', 'plot', 'commercial', 'rental'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const LISTING_KINDS = ['new-project', 'resale'] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export const PROPERTY_STATUSES = [
  'draft',
  'pending-review',
  'approved',
  /**
   * Legacy: previously meant "approved but unpaid". The subscription
   * model handles publishing gates at submission time, so no new
   * listing is ever set to this status. Kept in the enum so any
   * pre-existing rows in the database still load — admins can use the
   * moderation panel to re-approve them into `published`.
   */
  'awaiting-payment',
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
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
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
