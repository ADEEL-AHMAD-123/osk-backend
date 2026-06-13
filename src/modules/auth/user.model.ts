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
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  companyName?: string;
  companyRegistration?: string;
  /** Most recent browser Origin we've seen this user act from
   *  ("https://example.com"). Stamped on login + register and used
   *  as the base URL for any transactional email link fired by a
   *  background flow (subscription webhook activation, etc.) where
   *  no live request is available. */
  lastOrigin?: string;
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
    phone: { type: String, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 240 },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 80 },
    companyName: { type: String, trim: true, maxlength: 120 },
    companyRegistration: { type: String, trim: true, maxlength: 120 },
    lastOrigin: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

export const UserModel = model<UserDoc>('User', userSchema);
