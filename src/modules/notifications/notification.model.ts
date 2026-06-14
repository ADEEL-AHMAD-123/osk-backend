import { Schema, Types, model, type Document } from 'mongoose';

export type NotificationType =
  | 'inquiry.new'
  | 'inquiry.callback'
  | 'property.published'
  | 'property.review'
  | 'property.approved'
  | 'property.rejected'
  | 'subscription.activated'
  | 'subscription.cancelled'
  | 'user.welcome'
  | 'user.email-verified'
  | 'system';

export interface NotificationDoc extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body?: string;
  /** Optional deep-link to the resource in the app. */
  href?: string;
  read: boolean;
  /** Free-form payload — keep small; never PII beyond what the type implies. */
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'inquiry.new',
        'inquiry.callback',
        'property.published',
        'property.review',
        'property.approved',
        'property.rejected',
        'subscription.activated',
        'subscription.cancelled',
        'user.welcome',
        'user.email-verified',
        'system',
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, maxlength: 600 },
    href: { type: String, maxlength: 500 },
    read: { type: Boolean, default: false, index: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export const NotificationModel = model<NotificationDoc>(
  'Notification',
  notificationSchema,
);
