import { Schema, model, type Document, type Types } from 'mongoose';
import {
  PAYMENT_STATUSES,
  PROVIDER_KEYS,
  type PaymentStatus,
  type ProviderKey,
} from './payment.types';

export interface PaymentDoc extends Document {
  _id: Types.ObjectId;
  /** Property this payment is for. Optional now — subscription payments
   *  carry no property reference. */
  property?: Types.ObjectId;
  /** Subscription this payment renews / activates. Optional —
   *  legacy per-listing payments carry no subscription. */
  subscription?: Types.ObjectId;
  user: Types.ObjectId;
  provider: ProviderKey;
  status: PaymentStatus;
  amount: number;
  currency: string;
  /** Provider's transaction id. Unique per provider when present. */
  providerRef?: string;
  /** Provider-specific opaque metadata — checkout URL, client secret, etc. */
  metadata: Map<string, string>;
  /** Screenshot / receipt URL the seller uploaded as proof of a
   *  bank-transfer payment. Surfaced on the admin payments view so
   *  the operator can verify before confirming. */
  proofUrl?: string;
  /** When the seller uploaded the proof. */
  proofUploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDoc>(
  {
    property: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      index: true,
    },
    subscription: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: { type: String, enum: PROVIDER_KEYS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, length: 3 },
    providerRef: { type: String, index: true, sparse: true },
    metadata: { type: Map, of: String, default: new Map() },
    proofUrl: { type: String },
    proofUploadedAt: { type: Date },
  },
  { timestamps: true },
);

/* Compound index for the seller-facing "my payments" listing — newest first. */
paymentSchema.index({ user: 1, createdAt: -1 });
/* Lookup payments for a single listing — used when the seller revisits the
 * checkout page so we can reuse a still-pending intent. */
paymentSchema.index({ property: 1, status: 1, createdAt: -1 });

export const PaymentModel = model<PaymentDoc>('Payment', paymentSchema);
