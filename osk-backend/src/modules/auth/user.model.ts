import { Schema, model, type Document, type Types } from 'mongoose';

export type UserRole = 'buyer' | 'seller' | 'agent' | 'admin';
export type UserStatus = 'active' | 'blocked';

export interface UserDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  /** bcrypt hash — `select: false`, so it is never returned unless requested. */
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  emailVerifyTokenHash?: string;
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true, // creates the unique index
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['buyer', 'seller', 'agent', 'admin'],
      default: 'buyer',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
    },
    emailVerified: { type: Boolean, default: false },
    emailVerifyTokenHash: { type: String, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    avatarUrl: { type: String },
  },
  { timestamps: true },
);

export const UserModel = model<UserDoc>('User', userSchema);
