import { Schema, Types, model, type Document } from 'mongoose';

export type InquiryChannel = 'email' | 'call' | 'whatsapp' | 'chat';
export type InquiryStatus =
  | 'new'
  | 'contacted'
  | 'callback-requested'
  | 'closed';

export interface InquiryDoc extends Document {
  _id: Types.ObjectId;
  propertyId: Types.ObjectId;
  ownerId: Types.ObjectId;
  channel: InquiryChannel;
  status: InquiryStatus;
  /** Inquirer identity — masked for privacy on listing-card events. */
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  /** For callback flow. */
  slots?: string[];
  source?: 'listing-card' | 'detail-page';
  consent: boolean;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const inquirySchema = new Schema<InquiryDoc>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ['email', 'call', 'whatsapp', 'chat'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'callback-requested', 'closed'],
      default: 'new',
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    message: { type: String, maxlength: 2000 },
    slots: { type: [String], default: undefined },
    source: { type: String, enum: ['listing-card', 'detail-page'] },
    consent: { type: Boolean, required: true },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

// Owner dashboard: list newest inquiries per owner, optionally per property.
inquirySchema.index({ ownerId: 1, createdAt: -1 });
inquirySchema.index({ propertyId: 1, createdAt: -1 });

export const InquiryModel = model<InquiryDoc>('Inquiry', inquirySchema);
