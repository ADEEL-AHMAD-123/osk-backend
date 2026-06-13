import mongoose, { type Types } from 'mongoose';
import {
  NotFoundError,
  ServiceUnavailableError,
} from '../../shared/errors';
import {
  NotificationModel,
  type NotificationDoc,
  type NotificationType,
} from './notification.model';

function assertDbReady(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new ServiceUnavailableError(
      'Database unavailable — start MongoDB and try again',
    );
  }
}

export interface NotifyInput {
  userId: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  meta?: Record<string, unknown>;
}

export interface NotificationListFilters {
  read?: boolean;
  page: number;
  limit: number;
}

export const notificationService = {
  /** Producer hook — call from any module that wants to ping a user. */
  async notify(input: NotifyInput): Promise<NotificationDoc> {
    assertDbReady();
    return NotificationModel.create(input);
  },

  async listForUser(
    userId: string,
    filters: NotificationListFilters,
  ): Promise<{ items: NotificationDoc[]; total: number; unread: number }> {
    assertDbReady();
    const query: Record<string, unknown> = { userId };
    if (filters.read !== undefined) query.read = filters.read;
    const skip = (filters.page - 1) * filters.limit;
    const [items, total, unread] = await Promise.all([
      NotificationModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      NotificationModel.countDocuments(query),
      NotificationModel.countDocuments({ userId, read: false }),
    ]);
    return { items, total, unread };
  },

  async markRead(id: string, userId: string): Promise<NotificationDoc> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Notification not found');
    }
    const doc = await NotificationModel.findOneAndUpdate(
      { _id: id, userId },
      { read: true },
      { new: true },
    ).exec();
    if (!doc) throw new NotFoundError('Notification not found');
    return doc;
  },

  async markAllRead(userId: string): Promise<{ updated: number }> {
    assertDbReady();
    const result = await NotificationModel.updateMany(
      { userId, read: false },
      { read: true },
    );
    return { updated: result.modifiedCount };
  },
};
