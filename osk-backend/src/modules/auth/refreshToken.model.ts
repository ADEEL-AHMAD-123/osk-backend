import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * One row per issued refresh token. Tokens are opaque random strings; only the
 * SHA-256 hash is stored. `family` groups the rotation chain so that a detected
 * reuse can revoke every descendant in one operation.
 */
export interface RefreshTokenDoc extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  tokenHash: string;
  family: string;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    family: { type: String, required: true, index: true },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL index — Mongo purges expired tokens automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = model<RefreshTokenDoc>(
  'RefreshToken',
  refreshTokenSchema,
);
