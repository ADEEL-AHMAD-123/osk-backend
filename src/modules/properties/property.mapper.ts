import type { PropertyDoc } from './property.model';
import type { PropertyDTO } from './property.types';

/** Map a Mongoose property document to the client-facing DTO. */
export function toPropertyDTO(doc: PropertyDoc): PropertyDTO {
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    title: doc.title,
    type: doc.type,
    listingKind: doc.listingKind,
    status: doc.status,
    price: doc.price,
    currency: doc.currency,
    bedrooms: doc.bedrooms,
    bathrooms: doc.bathrooms,
    areaSqft: doc.areaSqft,
    locality: doc.locality,
    city: doc.city,
    country: doc.country ?? 'US',
    thumbnail: doc.thumbnail,
    isFeatured: doc.isFeatured,
    location: {
      type: 'Point',
      coordinates: doc.location.coordinates,
    },
    contactCapabilities: {
      chat: doc.contactCapabilities.chat,
      call: {
        enabled: doc.contactCapabilities.call.enabled,
        masked: doc.contactCapabilities.call.masked,
      },
      whatsapp: doc.contactCapabilities.whatsapp,
      email: doc.contactCapabilities.email,
    },
    description: doc.description,
    amenities: doc.amenities,
    media: doc.media.map((m) => ({
      id: m._id.toString(),
      url: m.url,
      kind: m.kind,
      width: m.width,
      height: m.height,
    })),
    yearBuilt: doc.yearBuilt,
    ownerId: doc.owner.toString(),
    agentId: doc.agent?.toString(),
    rejectionReason: doc.rejectionReason || undefined,
    rejectedAt: doc.rejectedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
