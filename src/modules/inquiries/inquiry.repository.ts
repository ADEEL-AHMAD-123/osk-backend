import mongoose, { type Types } from 'mongoose';
import { ServiceUnavailableError } from '../../shared/errors';
import { InquiryModel, type InquiryDoc, type InquiryStatus } from './inquiry.model';
import type { InquiryFilters } from './inquiry.schema';

function assertDbReady(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new ServiceUnavailableError(
      'Database is not connected. Start MongoDB then retry.',
    );
  }
}

export interface CreateInquiryInput {
  propertyId: Types.ObjectId | string;
  ownerId: Types.ObjectId | string;
  channel: InquiryDoc['channel'];
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  slots?: string[];
  source?: InquiryDoc['source'];
  consent: boolean;
  ip?: string;
  userAgent?: string;
}

export const inquiryRepository = {
  async create(input: CreateInquiryInput): Promise<InquiryDoc> {
    assertDbReady();
    return InquiryModel.create(input);
  },

  async findById(id: string): Promise<InquiryDoc | null> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) return null;
    return InquiryModel.findById(id).exec();
  },

  async list(
    filters: InquiryFilters,
    ownerScope?: Types.ObjectId | string,
  ): Promise<{ items: InquiryDoc[]; total: number }> {
    assertDbReady();
    const query: Record<string, unknown> = {};
    if (ownerScope) query.ownerId = ownerScope;
    if (filters.propertyId && mongoose.isValidObjectId(filters.propertyId)) {
      query.propertyId = filters.propertyId;
    }
    if (filters.channel) query.channel = filters.channel;
    if (filters.status) query.status = filters.status;

    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
      InquiryModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      InquiryModel.countDocuments(query),
    ]);
    return { items, total };
  },

  async updateStatus(
    id: string,
    status: InquiryStatus,
  ): Promise<InquiryDoc | null> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) return null;
    return InquiryModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    ).exec();
  },
};
