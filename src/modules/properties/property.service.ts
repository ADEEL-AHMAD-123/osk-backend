import crypto from 'node:crypto';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors';
import type { AuthUser } from '../../shared/middleware/auth';
import { settingsService } from '../settings/settings.service';
import { subscriptionService } from '../subscriptions/subscription.service';
import { UserModel } from '../auth/user.model';
import {
  sendPropertyApprovedEmail,
  sendPropertyRejectedEmail,
} from '../../shared/email/notificationEmails';
import { logger } from '../../config/logger';
import { InquiryModel } from '../inquiries/inquiry.model';
import { ReviewModel } from '../reviews/review.model';
import { ThreadModel } from '../threads/thread.model';
import { MessageModel } from '../threads/message.model';
import { notificationService } from '../notifications/notification.service';
import { PropertyModel } from './property.model';
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
  /**
   * Public, paginated listing — published/sold only. Honours the
   * marketplace-wide country allow-list configured in site settings,
   * so a customer who hits the API directly with a disallowed country
   * still gets an empty result. Owner-scoped reads (`listForOwner`)
   * deliberately skip this — owners can always see their own listings
   * regardless of the geographic scope.
   */
  async list(filters: PropertyFilters): Promise<Paginated<PropertyDTO>> {
    const geo = await settingsService.getGeo();
    const allowedCountries =
      geo.mode === 'restricted' && geo.allowedCountries.length > 0
        ? geo.allowedCountries
        : undefined;
    const { items, total } = await propertyRepository.list(filters, {
      statuses: PUBLIC_STATUSES,
      allowedCountries,
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
    /* Subscription gate: every seller needs an active plan, and they
     * can't exceed the plan's submissions cap. We throw a Forbidden
     * with a recognisable code so the frontend can redirect to /pricing
     * on the no-plan case and surface "upgrade your plan" on the
     * over-limit case. */
    const resolved = await subscriptionService.resolve(ownerId);
    if (resolved.status === 'none' || resolved.status === 'expired') {
      throw new ForbiddenError(
        'You need an active plan before publishing a listing. Visit /pricing to subscribe.',
      );
    }
    const limit = resolved.limits.submissions;
    if (typeof limit === 'number') {
      const existing = await propertyRepository.countOwned(ownerId);
      if (existing >= limit) {
        throw new ForbiddenError(
          `Your plan allows up to ${limit} listings. Upgrade your plan to add more.`,
        );
      }
    }

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
      country: input.country,
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

  /**
   * Owner marks a published listing as sold (deal closed off-platform). The
   * listing stays browsable for history but drops out of public search. Only
   * the owner or an admin can flip this.
   */
  async markSold(id: string, actor: AuthUser): Promise<PropertyDTO> {
    const doc = await loadOwned(id, actor);
    if (doc.status !== 'published') {
      throw new ConflictError(
        `Only a published listing can be marked sold (this one is "${doc.status}")`,
      );
    }
    doc.status = 'sold';
    await doc.save();
    return toPropertyDTO(doc);
  },

  /**
   * Owner re-opens a sold listing — useful if a deal falls through or the
   * property comes back on the market. The listing returns to "draft" so
   * the owner can update price / details before re-submitting for review.
   */
  async reopen(id: string, actor: AuthUser): Promise<PropertyDTO> {
    const doc = await loadOwned(id, actor);
    if (doc.status !== 'sold') {
      throw new ConflictError(
        `Only a sold listing can be re-opened (this one is "${doc.status}")`,
      );
    }
    doc.status = 'draft';
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

  /**
   * Admin moderation — `approve` publishes the listing immediately,
   * `reject` sends it back to `rejected`. The seller's right to
   * publish is gated at submission time by their subscription plan
   * (see `create`), so there's no per-listing payment step here.
   *
   * The optional `reason` is required UX-wise on reject (the admin
   * panel enforces it), but stored as a free-text field so legacy
   * rejections without one keep loading. On approve we clear any
   * prior rejection metadata so the seller's dashboard doesn't keep
   * showing a stale "rejected because…" note next to a now-live
   * listing.
   */
  async review(
    id: string,
    decision: 'approve' | 'reject',
    opts: { reason?: string } = {},
  ): Promise<PropertyDTO> {
    const doc = await propertyRepository.findById(id);
    if (!doc) throw new NotFoundError('Property not found');
    if (doc.status !== 'pending-review') {
      throw new ConflictError(
        'Only listings pending review can be approved or rejected',
      );
    }
    if (decision === 'reject') {
      doc.status = 'rejected';
      doc.rejectionReason = (opts.reason ?? '').trim();
      doc.rejectedAt = new Date();
    } else {
      doc.status = 'published';
      /* Clear stale rejection metadata so the dashboard doesn't show
       * a misleading "rejected" note next to a now-published row. */
      doc.rejectionReason = '';
      doc.rejectedAt = undefined;
    }
    await doc.save();

    /* Notify the owner — fire-and-forget. Approved gets the "live
     * now" email, rejected gets the reason in a styled block so the
     * seller knows what to fix before resubmitting.
     *
     * Review is triggered by an admin, so the live request origin is
     * the admin's — that's irrelevant to the seller. Use the owner's
     * stored `lastOrigin` so links point to whichever domain the
     * seller actually uses. */
    void (async () => {
      try {
        const owner = await UserModel.findById(doc.owner).exec();
        if (!owner) return;
        if (decision === 'approve') {
          await sendPropertyApprovedEmail({
            to: owner.email,
            name: owner.name,
            propertyTitle: doc.title,
            propertySlug: doc.slug,
            userOrigin: owner.lastOrigin ?? null,
          });
        } else {
          await sendPropertyRejectedEmail({
            to: owner.email,
            name: owner.name,
            propertyTitle: doc.title,
            propertySlug: doc.slug,
            reason: doc.rejectionReason ?? '',
            userOrigin: owner.lastOrigin ?? null,
          });
        }
      } catch (err) {
        logger.warn({ err, decision }, 'property review email skipped');
      }
    })();

    /* In-app notification — separate side effect from the email so a
     * delivery blip on either channel doesn't take the other down. The
     * approved href points at the public listing so the seller can
     * see (and share) it live; the rejected href points at the
     * dashboard listing row so they can read the full reason and edit
     * before re-submitting. */
    void notificationService
      .notify({
        userId: doc.owner,
        type: decision === 'approve' ? 'property.approved' : 'property.rejected',
        title:
          decision === 'approve'
            ? `Listing approved: ${doc.title}`
            : `Listing rejected: ${doc.title}`,
        body:
          decision === 'approve'
            ? 'Your listing is live and visible in search results.'
            : doc.rejectionReason
              ? `Reason: ${doc.rejectionReason}`
              : 'The reviewer didn’t include a written reason — edit and resubmit.',
        href:
          decision === 'approve'
            ? `/property/${doc.slug}`
            : `/dashboard/listings`,
        meta: { propertyId: doc._id.toString(), slug: doc.slug },
      })
      .catch((err) =>
        logger.warn({ err, decision }, 'property review notification skipped'),
      );

    return toPropertyDTO(doc);
  },

  /**
   * Permanently delete a listing and everything attached to it.
   *
   * Owner or admin only. Cascades:
   *   - inquiries on this property
   *   - threads and all their messages
   *   - reviews left on this property
   *   - the listing itself
   *
   * (Saved-by-others entries live in localStorage on the frontend, so
   *  no DB cleanup needed there — the stale entry just disappears
   *  next time those users open /saved.)
   *
   * The subscription slot is freed automatically because the
   * `subscriptionService.countOwnedPublished` query reads from the
   * Property collection at request time.
   */
  async remove(id: string, actor: AuthUser): Promise<{ deleted: true }> {
    const doc = await loadOwned(id, actor);
    const propertyId = doc._id;

    const threads = await ThreadModel.find({ propertyId })
      .select('_id')
      .lean()
      .exec();
    const threadIds = threads.map((t) => t._id);

    await Promise.all([
      InquiryModel.deleteMany({ propertyId }).exec(),
      ReviewModel.deleteMany({ propertyId }).exec(),
      threadIds.length
        ? MessageModel.deleteMany({ threadId: { $in: threadIds } }).exec()
        : Promise.resolve(),
      threadIds.length
        ? ThreadModel.deleteMany({ _id: { $in: threadIds } }).exec()
        : Promise.resolve(),
    ]);

    await PropertyModel.deleteOne({ _id: propertyId }).exec();
    logger.info(
      { propertyId: propertyId.toString(), actor: actor.id },
      'property hard-deleted',
    );
    return { deleted: true };
  },
};
