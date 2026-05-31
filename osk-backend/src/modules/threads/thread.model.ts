import { Schema, Types, model, type Document } from 'mongoose';

export interface ThreadDoc extends Document {
  _id: Types.ObjectId;
  propertyId: Types.ObjectId;
  /** Two-participant thread for the MVP — buyer (initiator) and owner. */
  participants: Types.ObjectId[];
  ownerId: Types.ObjectId;
  initiatorId: Types.ObjectId;
  lastMessageAt: Date;
  /** Per-user unread counters keyed by stringified userId. */
  unread: Map<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const threadSchema = new Schema<ThreadDoc>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    initiatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    lastMessageAt: { type: Date, default: () => new Date(), index: true },
    unread: {
      type: Map,
      of: Number,
      default: () => new Map<string, number>(),
    },
  },
  { timestamps: true },
);

/** One thread per (property, initiator) pair. */
threadSchema.index({ propertyId: 1, initiatorId: 1 }, { unique: true });
threadSchema.index({ participants: 1, lastMessageAt: -1 });

export const ThreadModel = model<ThreadDoc>('Thread', threadSchema);
