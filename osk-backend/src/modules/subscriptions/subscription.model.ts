import { Schema, model, type Document, type Types } from 'mongoose';
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from './subscription.types';

export interface SubscriptionDoc extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  plan: Types.ObjectId;
  /** Denormalised plan slug so app code can short-circuit on a known tier. */
  planSlug: string;
  status: SubscriptionStatus;
  startedAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelledAt: Date | null;
  payment: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<SubscriptionDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    planSlug: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: 'pending-payment',
      index: true,
    },
    startedAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null, index: true },
    cancelledAt: { type: Date, default: null },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
  },
  { timestamps: true },
);

/* Find a user's latest subscription quickly — used on every API hit
 * that needs to know the current tier. */
subscriptionSchema.index({ user: 1, createdAt: -1 });

export const SubscriptionModel = model<SubscriptionDoc>(
  'Subscription',
  subscriptionSchema,
);
