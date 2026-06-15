import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * A message sent through the public /contact form. Lives separately
 * from the property-scoped `Inquiry` because:
 *   - it has no propertyId (general questions, partnerships, press, etc.)
 *   - the audience is the site admin, not a property owner
 *   - the status workflow is simpler: new → replied → closed
 *
 * `status: 'new'` is what the admin badge counts. Admins flip it to
 * `replied` after sending the response, or `closed` for spam/wontfix.
 */
export type ContactMessageStatus = 'new' | 'replied' | 'closed';

export const CONTACT_TOPICS = [
  'General inquiry',
  'Sales',
  'Support',
  'Press',
  'Partnerships',
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export interface ContactMessageDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  status: ContactMessageStatus;
  /** Audit-trail metadata captured at submit time. */
  ip?: string;
  userAgent?: string;
  /** Free-form note the admin can leave on the record after replying. */
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const contactMessageSchema = new Schema<ContactMessageDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 200,
    },
    topic: {
      type: String,
      enum: CONTACT_TOPICS,
      default: 'General inquiry',
    },
    message: { type: String, required: true, trim: true, minlength: 5, maxlength: 4000 },
    status: {
      type: String,
      enum: ['new', 'replied', 'closed'],
      default: 'new',
      index: true,
    },
    ip: { type: String },
    userAgent: { type: String },
    adminNote: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true },
);

/* Admin list: newest unread first. */
contactMessageSchema.index({ status: 1, createdAt: -1 });

export const ContactMessageModel = model<ContactMessageDoc>(
  'ContactMessage',
  contactMessageSchema,
);
