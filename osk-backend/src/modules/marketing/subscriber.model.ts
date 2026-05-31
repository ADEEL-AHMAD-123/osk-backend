import { Schema, Types, model, type Document } from 'mongoose';

export interface NewsletterSubscriberDoc extends Document {
  _id: Types.ObjectId;
  email: string;
  source?: string;
  unsubscribedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriberSchema = new Schema<NewsletterSubscriberDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true, // creates the unique index
      lowercase: true,
      trim: true,
    },
    source: { type: String, maxlength: 120 },
    unsubscribedAt: { type: Date },
  },
  { timestamps: true },
);

export const NewsletterSubscriberModel = model<NewsletterSubscriberDoc>(
  'NewsletterSubscriber',
  subscriberSchema,
);
