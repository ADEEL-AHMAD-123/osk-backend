import { Schema, Types, model, type Document } from 'mongoose';

export type MessageAttachmentKind = 'image' | 'video';

export interface MessageAttachment {
  url: string;
  kind: MessageAttachmentKind;
  mimeType?: string;
  size?: number;
}

export interface MessageDoc extends Document {
  _id: Types.ObjectId;
  threadId: Types.ObjectId;
  senderId: Types.ObjectId;
  body: string;
  attachments?: MessageAttachment[];
  createdAt: Date;
}

const attachmentSchema = new Schema<MessageAttachment>(
  {
    url: { type: String, required: true, maxlength: 500 },
    kind: { type: String, enum: ['image', 'video'], required: true },
    mimeType: { type: String, maxlength: 80 },
    size: { type: Number, min: 0 },
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDoc>(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: 'Thread',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    attachments: { type: [attachmentSchema], default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ threadId: 1, createdAt: 1 });

export const MessageModel = model<MessageDoc>('Message', messageSchema);
