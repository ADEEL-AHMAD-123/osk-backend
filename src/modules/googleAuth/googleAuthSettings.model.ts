import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Google OAuth settings singleton — admin-editable client ID + client
 * secret used by the "Continue with Google" flow.
 *
 *  - `enabled: false`  → button hidden, callback returns 404. Useful
 *                        when keys haven't been pasted yet.
 *  - `enabled: true`   → button rendered, callback verifies tokens.
 *
 * The client secret is encrypted at rest via the same shared AES
 * helper used by the payment-provider keys.
 */
export interface GoogleAuthSettingsDoc extends Document {
  _id: Types.ObjectId;
  singletonKey: 'default';
  enabled: boolean;
  /** Public OAuth client ID. Safe to expose to the browser. */
  clientId: string;
  /** OAuth client secret. Encrypted at rest. */
  clientSecret: string;
  createdAt: Date;
  updatedAt: Date;
}

const googleAuthSettingsSchema = new Schema<GoogleAuthSettingsDoc>(
  {
    singletonKey: {
      type: String,
      enum: ['default'],
      required: true,
      unique: true,
      default: 'default',
    },
    enabled: { type: Boolean, default: false },
    clientId: { type: String, default: '', trim: true, maxlength: 200 },
    clientSecret: { type: String, default: '' },
  },
  { timestamps: true },
);

export const GoogleAuthSettingsModel = model<GoogleAuthSettingsDoc>(
  'GoogleAuthSettings',
  googleAuthSettingsSchema,
);
