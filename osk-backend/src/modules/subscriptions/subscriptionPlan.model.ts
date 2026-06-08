import { Schema, model, type Document, type Types } from 'mongoose';
import {
  FEATURE_KEYS,
  PLAN_INTERVALS,
  type PlanFeature,
  type PlanInterval,
  type PlanPrice,
} from './subscriptionPlan.types';

export interface SubscriptionPlanDoc extends Document {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  tagline: string;
  prices: PlanPrice[];
  interval: PlanInterval;
  features: PlanFeature[];
  sortOrder: number;
  highlight: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const priceSchema = new Schema<PlanPrice>(
  {
    currency: { type: String, required: true, uppercase: true, length: 3 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const featureSchema = new Schema<PlanFeature>(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    included: { type: Boolean, default: true },
    key: { type: String, enum: FEATURE_KEYS },
    limit: { type: Number, default: null }, // null = unlimited
  },
  { _id: false },
);

const planSchema = new Schema<SubscriptionPlanDoc>(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    tagline: { type: String, default: '', trim: true, maxlength: 140 },
    prices: { type: [priceSchema], default: [] },
    interval: { type: String, enum: PLAN_INTERVALS, default: 'month' },
    features: { type: [featureSchema], default: [] },
    sortOrder: { type: Number, default: 0 },
    highlight: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

planSchema.index({ active: 1, sortOrder: 1 });

export const SubscriptionPlanModel = model<SubscriptionPlanDoc>(
  'SubscriptionPlan',
  planSchema,
);
