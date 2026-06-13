import { Schema, model, type Document, type Types } from 'mongoose';

export type UserRole = 'buyer' | 'seller' | 'agent' | 'admin';
export type UserStatus = 'active' | 'blocked';

/** A linked sign-in provider. Each user may have any combination —
 *  password (implicit, signaled by `passwordHash` being present),
 *  google (a `google` identity), and any future provider we add. */
export type IdentityProvider = 'google';

export interface UserIdentity {
  provider: IdentityProvider;
  /** The provider's stable user id (`sub` for Google ID tokens). */
  providerUserId: string;
  linkedAt: Date;
}

export interface UserDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  /** bcrypt hash — `select: false`, so it is never returned unless requested.
   *  OPTIONAL because a user can be Google-only and have no password set. */
  passwordHash?: string;
  /** Federated sign-in identities. An empty array means the user only
   *  has a password (or, more rarely, no working sign-in method at all
   *  — which the service layer must prevent). */
  identities: UserIdentity[];
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
    passwordHash: { type: String, select: false },
    identities: {
      type: [
        new Schema<UserIdentity>(
          {
            provider: {
              type: String,
              enum: ['google'],
              required: true,
            },
            providerUserId: { type: String, required: true, trim: true },
            linkedAt: { type: Date, default: () => new Date() },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
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

/* Lets us look up a federated identity in O(log n) without a collection
 * scan — critical on the Google callback hot path. */
userSchema.index({ 'identities.provider': 1, 'identities.providerUserId': 1 });

export const UserModel = model<UserDoc>('User', userSchema);
