import mongoose, { type FilterQuery, type PipelineStage } from 'mongoose';
import { ServiceUnavailableError } from '../../shared/errors';
import { PropertyModel, type PropertyDoc } from './property.model';
import type { PropertyFilters } from './property.schema';
import type {
  ContactCapabilities,
  ListingKind,
  PropertyStatus,
  PropertyType,
} from './property.types';

/** Properties infrastructure layer — all MongoDB access. */

function assertDbReady(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new ServiceUnavailableError(
      'Database unavailable — start MongoDB and try again',
    );
  }
}

const SORT: Record<PropertyFilters['sort'], Record<string, 1 | -1>> = {
  '-createdAt': { createdAt: -1 },
  createdAt: { createdAt: 1 },
  price: { price: 1 },
  '-price': { price: -1 },
};

export interface ListOptions {
  /** Visible statuses (public listing vs. owner dashboard). */
  statuses?: PropertyStatus[];
  /** Restrict to one owner. */
  owner?: string;
}

/** Data accepted by `create` — server-derived fields included. */
export interface NewPropertyData {
  slug: string;
  title: string;
  description: string;
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
  amenities: string[];
  location: { type: 'Point'; coordinates: [number, number] };
  thumbnail: string;
  isFeatured: boolean;
  contactCapabilities: ContactCapabilities;
  owner: string;
  media?: Array<{ url: string; kind: 'image' | 'video' | 'floorplan' }>;
}

function buildFilter(
  filters: PropertyFilters,
  opts: ListOptions,
): FilterQuery<PropertyDoc> {
  const query: Record<string, unknown> = {};

  if (opts.statuses) query.status = { $in: opts.statuses };
  if (opts.owner) query.owner = opts.owner;
  if (filters.type) query.type = filters.type;
  if (filters.listingKind) query.listingKind = filters.listingKind;
  if (filters.city) {
    // Case-insensitive exact match — robust to slug→name translation
    // ("New York" vs "new york") and varied seed casing.
    const escaped = filters.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.city = { $regex: `^${escaped}$`, $options: 'i' };
  }
  if (filters.bedrooms !== undefined) query.bedrooms = { $gte: filters.bedrooms };
  if (filters.isFeatured !== undefined) query.isFeatured = filters.isFeatured;

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const price: Record<string, number> = {};
    if (filters.minPrice !== undefined) price.$gte = filters.minPrice;
    if (filters.maxPrice !== undefined) price.$lte = filters.maxPrice;
    query.price = price;
  }
  if (filters.q) query.$text = { $search: filters.q };

  return query as FilterQuery<PropertyDoc>;
}

export const propertyRepository = {
  async list(
    filters: PropertyFilters,
    opts: ListOptions,
  ): Promise<{ items: PropertyDoc[]; total: number }> {
    assertDbReady();
    const filter = buildFilter(filters, opts);
    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
      PropertyModel.find(filter)
        .sort(SORT[filters.sort])
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      PropertyModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  },

  async findBySlug(slug: string): Promise<PropertyDoc | null> {
    assertDbReady();
    return PropertyModel.findOne({ slug }).exec();
  },

  async findById(id: string): Promise<PropertyDoc | null> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) return null;
    return PropertyModel.findById(id).exec();
  },

  async slugExists(slug: string): Promise<boolean> {
    assertDbReady();
    return (await PropertyModel.exists({ slug })) !== null;
  },

  async create(data: NewPropertyData): Promise<PropertyDoc> {
    assertDbReady();
    return new PropertyModel(data).save();
  },

  /** Properties whose point falls inside a [west, south, east, north] box. */
  async findInViewport(
    bbox: [number, number, number, number],
    statuses: PropertyStatus[],
  ): Promise<PropertyDoc[]> {
    assertDbReady();
    const [west, south, east, north] = bbox;
    return PropertyModel.find({
      status: { $in: statuses },
      location: {
        $geoWithin: {
          $box: [
            [west, south],
            [east, north],
          ],
        },
      },
    })
      .limit(300)
      .exec();
  },

  /** Atomic +1 to the listing's view count. No-op if the id is malformed. */
  async incrementViewCount(id: string): Promise<void> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) return;
    await PropertyModel.updateOne(
      { _id: id },
      { $inc: { viewCount: 1 } },
    ).exec();
  },

  /**
   * Per-listing analytics for one owner.
   *
   * One aggregation pipeline joins the property docs against the inquiries
   * collection so we get the inquiry count without an extra round trip per
   * row. Returned rows are sorted newest-first.
   */
  async ownerAnalytics(ownerId: string): Promise<OwnerAnalytics> {
    assertDbReady();
    if (!mongoose.isValidObjectId(ownerId)) {
      return { totals: { views: 0, inquiries: 0, listings: 0 }, items: [] };
    }
    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

    const pipeline: PipelineStage[] = [
      { $match: { owner: ownerObjectId } },
      {
        $lookup: {
          from: 'inquiries',
          let: { pid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$propertyId', '$$pid'] } } },
            { $count: 'n' },
          ],
          as: 'inquiryCount',
        },
      },
      {
        $addFields: {
          inquiries: {
            $ifNull: [{ $arrayElemAt: ['$inquiryCount.n', 0] }, 0],
          },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 1,
          slug: 1,
          title: 1,
          thumbnail: 1,
          status: 1,
          viewCount: 1,
          inquiries: 1,
        },
      },
    ];

    const rows = await PropertyModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      slug: string;
      title: string;
      thumbnail: string;
      status: PropertyStatus;
      viewCount?: number;
      inquiries: number;
    }>(pipeline).exec();

    const items = rows.map((r) => ({
      id: r._id.toString(),
      slug: r.slug,
      title: r.title,
      thumbnail: r.thumbnail,
      status: r.status,
      views: r.viewCount ?? 0,
      inquiries: r.inquiries,
    }));

    return {
      totals: {
        listings: items.length,
        views: items.reduce((a, x) => a + x.views, 0),
        inquiries: items.reduce((a, x) => a + x.inquiries, 0),
      },
      items,
    };
  },
};

export interface OwnerAnalyticsRow {
  id: string;
  slug: string;
  title: string;
  thumbnail: string;
  status: PropertyStatus;
  views: number;
  inquiries: number;
}

export interface OwnerAnalytics {
  totals: { views: number; inquiries: number; listings: number };
  items: OwnerAnalyticsRow[];
}
