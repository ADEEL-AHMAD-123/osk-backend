import mongoose from 'mongoose';
import {
  NotFoundError,
  ServiceUnavailableError,
} from '../../shared/errors';
import { UserModel, type UserDoc, type UserRole } from '../auth/user.model';
import type { UpdateProfileDto, UserFilters } from './user.schema';

function assertDbReady(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new ServiceUnavailableError(
      'Database unavailable — start MongoDB and try again',
    );
  }
}

export const userService = {
  async findById(id: string): Promise<UserDoc> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('User not found');
    }
    const user = await UserModel.findById(id).exec();
    if (!user) throw new NotFoundError('User not found');
    return user;
  },

  async updateProfile(
    id: string,
    patch: UpdateProfileDto,
  ): Promise<UserDoc> {
    assertDbReady();
    const next: Record<string, unknown> = {};
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.avatarUrl !== undefined) {
      next.avatarUrl = patch.avatarUrl || undefined;
    }
    const user = await UserModel.findByIdAndUpdate(id, next, {
      new: true,
    }).exec();
    if (!user) throw new NotFoundError('User not found');
    return user;
  },

  async list(
    filters: UserFilters,
    opts: { role?: UserRole } = {},
  ): Promise<{ items: UserDoc[]; total: number }> {
    assertDbReady();
    const query: Record<string, unknown> = {};
    if (filters.role) query.role = filters.role;
    if (opts.role) query.role = opts.role;
    if (filters.q) {
      // Lightweight text search on name / email.
      const re = new RegExp(filters.q.trim(), 'i');
      query.$or = [{ name: re }, { email: re }];
    }
    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
      UserModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      UserModel.countDocuments(query),
    ]);
    return { items, total };
  },
};
