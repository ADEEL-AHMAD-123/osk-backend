import crypto from 'node:crypto';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors';
import type { AuthUser } from '../../shared/middleware/auth';
import { propertyRepository, type OwnerAnalytics } from './property.repository';
import { toPropertyDTO } from './property.mapper';
import type { PropertyDoc } from './property.model';
import type {
  CreatePropertyInput,
  PropertyFilters,
  UpdatePropertyInput,
} from './property.schema';
import type {
  ContactCapabilities,
  PropertyDTO,
  PropertyStatus,
} from './property.types';

/** Properties application layer — use-cases over the repository. */

// Public listings show only live inventory.
const PUBLIC_STATUSES: PropertyStatus[] = ['published', 'sold'];

const DEFAULT_THUMBNAIL =
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=70';

const DEFAULT_CAPABILITIES: ContactCapabilities = {
  chat: true,
  call: { enabled: true, masked: true },
  whatsapp: true,
  email: true,
};

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 56);
  return `${base || 'listing'}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Load a property the actor is allowed to manage (owner, or admin). */
async function loadOwned(id: string, actor: AuthUser): Promise<PropertyDoc> {
  const doc = await propertyRepository.findById(id);
  if (!doc) throw new NotFoundError('Property not found');
  if (doc.owner.toString() !== actor.id && actor.role !== 'admin') {
    throw new ForbiddenError('You can only manage your own listings');
  }
  return doc;
}

export const propertyService = {
  /** Public, paginated listing — published/sold only. */
  async list(filters: PropertyFilters): Promise<Paginated<PropertyDTO>> {
    const { items, total } = await propertyRepository.list(filters, {
      statuses: PUBLIC_STATUSES,
    });
    return { items: items.map(toPropertyDTO), total, page: filters.page, limit: filters.limit };
  },

  /** An owner's own listings — every status. */
  async listForOwner(
    ownerId: string,
    filters: PropertyFilters,
  ): Promise<Paginated<PropertyDTO>> {
    const { items, total } = await propertyRepository.list(filters, {
      owner: ownerId,
    });
    return { items: items.map(toPropertyDTO), total, page: filters.page, limit: filters.limit };
  },

  /**
   * Public listings owned by a specific agent/seller — published/sold only.
   * Used by /agents/:id/listings to render an agent's roster on the public
   * detail page without exposing drafts or rejected inventory.
   */
  async listPublicForOwner(
    ownerId: string,
    filters: PropertyFilters,
  ): Promise<Paginated<PropertyDTO>> {
    const { items, total } = await propertyRepository.list(filters, {
      owner: ownerId,
      statuses: PUBLIC_STATUSES,
    });
    return { items: items.map(toPropertyDTO), total, page: filters.page, limit: filters.limit };
  },

  async getBySlug(slug: string): Promise<PropertyDTO> {
    const doc = await propertyRepository.findBySlug(slug);
    if (!doc) throw new NotFoundError(`Property "${slug}" not found`);
    return toPropertyDTO(doc);
  },

  async getById(id: string): Promise<PropertyDTO> {
    const doc = await propertyRepository.findById(id);
    if (!doc) throw new NotFoundError('Property not found');
    return toPropertyDTO(doc);
  },

  async inViewport(
    bbox: [number, number, number, number],
  ): Promise<PropertyDTO[]> {
    const docs = await propertyRepository.findInViewport(bbox, PUBLIC_STATUSES);
    return docs.map(toPropertyDTO);
  },

  /** Create a new listing — starts life as a draft. */
  async create(
    ownerId: string,
    input: CreatePropertyInput,
  ): Promise<PropertyDTO> {
    const media = (input.media ?? []).map((m) => ({
      url: m.url,
      kind: m.kind,
    }));
    const firstImage = media.find((m) => m.kind === 'image');
    const doc = await propertyRepository.create({
      title: input.title,
      description: input.description,
      type: input.type,
      listingKind: input.listingKind,
      status: 'draft',
      price: input.price,
      currency: input.currency,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      areaSqft: input.areaSqft,
      locality: input.locality,
      city: input.city,
      amenities: input.amenities,
      location: input.location,
      slug: slugify(input.title),
      thumbnail: firstImage?.url ?? DEFAULT_THUMBNAIL,
      isFeatured: false,
      contactCapabilities: DEFAULT_CAPABILITIES,
      owner: ownerId,
      media,
    });
    return toPropertyDTO(doc);
  },

  async update(
    id: string,
    actor: AuthUser,
    input: UpdatePropertyInput,
  ): Promise<PropertyDTO> {
    const doc = await loadOwned(id, actor);
    Object.assign(doc, input);
    /* If media changed, keep the thumbnail in sync with the first image. */
    if (input.media) {
      const firstImage = input.media.find((m) => m.kind === 'image');
      if (firstImage) doc.thumbnail = firstImage.url;
    }
    await doc.save();
    return toPropertyDTO(doc);
  },

  /** Owner submits a draft/rejected listing into the moderation queue. */
  async submitForReview(id: string, actor: AuthUser): Promise<PropertyDTO> {
    const doc = await loadOwned(id, actor);
    if (doc.status !== 'draft' && doc.status !== 'rejected') {
      throw new ConflictError(
        `A "${doc.status}" listing cannot be submitted for review`,
      );
    }
    doc.status = 'pending-review';
    await doc.save();
    return toPropertyDTO(doc);
  },

  /** Fire-and-forget view-count bump. Bounded by route-level rate limit. */
  async recordView(id: string): Promise<void> {
    await propertyRepository.incrementViewCount(id);
  },

  /** Per-listing analytics for an owner — views + inquiry counts. */
  async ownerAnalytics(ownerId: string): Promise<OwnerAnalytics> {
    return propertyRepository.ownerAnalytics(ownerId);
  },

  /** Admin moderation — approve publishes the listing, reject sends it back. */
  async review(
    id: string,
    decision: 'approve' | 'reject',
  ): Promise<PropertyDTO> {
    const doc = await propertyRepository.findById(id);
    if (!doc) throw new NotFoundError('Property not found');
    if (doc.status !== 'pending-review') {
      throw new ConflictError(
        'Only listings pending review can be approved or rejected',
      );
    }
    doc.status = decision === 'approve' ? 'published' : 'rejected';
    await doc.save();
    return toPropertyDTO(doc);
  },
};
