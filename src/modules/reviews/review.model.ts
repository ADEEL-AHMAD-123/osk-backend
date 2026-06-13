import { Schema, Types, model, type Document } from 'mongoose';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewDoc extends Document {
  _id: Types.ObjectId;
  propertyId: Types.ObjectId;
  authorId: Types.ObjectId;
  rating: number; // 1..5
  title?: string;
  body: string;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: { type: String, maxlength: 120, trim: true },
    body: { type: String, required: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
      index: true,
    },
  },
  { timestamps: true },
);

// One review per author per property.
reviewSchema.index({ propertyId: 1, authorId: 1 }, { unique: true });
reviewSchema.index({ propertyId: 1, createdAt: -1 });

export const ReviewModel = model<ReviewDoc>('Review', reviewSchema);
