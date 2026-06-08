import mongoose from 'mongoose';
import { ConflictError, NotFoundError } from '../../shared/errors';
import {
  SubscriptionPlanModel,
  type SubscriptionPlanDoc,
} from './subscriptionPlan.model';
import { toSubscriptionPlanDTO } from './subscriptionPlan.mapper';
import type {
  CreatePlanInput,
  UpdatePlanInput,
} from './subscriptionPlan.schema';
import type { SubscriptionPlanDTO } from './subscriptionPlan.types';

export const subscriptionPlanService = {
  /** Public — only active plans, sorted for the pricing grid. */
  async listPublic(): Promise<SubscriptionPlanDTO[]> {
    const docs = await SubscriptionPlanModel.find({ active: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .exec();
    return docs.map(toSubscriptionPlanDTO);
  },

  /** Admin — every plan, including disabled ones. */
  async listAdmin(): Promise<SubscriptionPlanDTO[]> {
    const docs = await SubscriptionPlanModel.find()
      .sort({ active: -1, sortOrder: 1, createdAt: 1 })
      .exec();
    return docs.map(toSubscriptionPlanDTO);
  },

  async getById(id: string): Promise<SubscriptionPlanDoc | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return SubscriptionPlanModel.findById(id).exec();
  },

  /** Cheap lookup by stable slug — used by code paths that hard-code a tier. */
  async getBySlug(slug: string): Promise<SubscriptionPlanDoc | null> {
    return SubscriptionPlanModel.findOne({ slug }).exec();
  },

  async create(input: CreatePlanInput): Promise<SubscriptionPlanDTO> {
    /* Slug is unique — guard with a friendlier error than the mongo
     * duplicate-key one so the admin UI can surface it. */
    const existing = await this.getBySlug(input.slug);
    if (existing) {
      throw new ConflictError(`A plan with slug "${input.slug}" already exists`);
    }
    const doc = await SubscriptionPlanModel.create(input);
    return toSubscriptionPlanDTO(doc);
  },

  async update(
    id: string,
    input: UpdatePlanInput,
  ): Promise<SubscriptionPlanDTO> {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Plan not found');
    }
    /* If slug is being changed, make sure the new one is free. */
    if (input.slug) {
      const clashing = await SubscriptionPlanModel.findOne({
        slug: input.slug,
        _id: { $ne: id },
      }).exec();
      if (clashing) {
        throw new ConflictError(
          `Another plan already uses slug "${input.slug}"`,
        );
      }
    }
    const doc = await SubscriptionPlanModel.findByIdAndUpdate(id, input, {
      new: true,
      runValidators: true,
    }).exec();
    if (!doc) throw new NotFoundError('Plan not found');
    return toSubscriptionPlanDTO(doc);
  },

  async delete(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Plan not found');
    }
    const res = await SubscriptionPlanModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundError('Plan not found');
  },
};
