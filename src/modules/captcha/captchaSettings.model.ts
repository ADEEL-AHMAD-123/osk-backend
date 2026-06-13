import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * CAPTCHA settings singleton — admin-editable provider config for
 * protecting the signup form (and any other public form we want to
 * shield from bots).
 *
 *  - `provider: 'none'`     → captcha is OFF. Public config endpoint
 *                             reports it so the frontend doesn't mount
 *                             a widget and the backend skips
 *                             verification. Useful for local dev.
 *  - `provider: 'turnstile'`→ Cloudflare Turnstile. siteKey is the
 *                             public widget key (rendered in the
 *                             frontend), secretKey is verified at
 *                             challenges.cloudflare.com from the
 *                             backend.
 *
 *  The secret key is encrypted at rest via the shared AES helper
 *  (same crypto used for the payment provider keys), so anyone with
 *  read access to the DB still can't reuse the token.
 */

/**
 *  - `provider: 'local'`    → built-in text captcha. Backend generates
 *                             a short distorted-text SVG + an HMAC-signed
 *                             token; the user types what they see and
 *                             we verify the answer against the token.
 *                             No third-party calls, no keys to manage.
 *                             Weaker than Turnstile against OCR-equipped
 *                             bots, but zero configuration.
 */
export const CAPTCHA_PROVIDER_KEYS = ['none', 'turnstile', 'local'] as const;
export type CaptchaProviderKey = (typeof CAPTCHA_PROVIDER_KEYS)[number];

export interface CaptchaSettingsDoc extends Document {
  _id: Types.ObjectId;
  /** Marker so we can singleton-enforce via a unique index. */
  singletonKey: 'default';
  provider: CaptchaProviderKey;
  /** Public widget site key. Safe to expose to the browser. */
  siteKey: string;
  /** Server-side secret key — encrypted at rest. */
  secretKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const captchaSettingsSchema = new Schema<CaptchaSettingsDoc>(
  {
    singletonKey: {
      type: String,
      enum: ['default'],
      required: true,
      unique: true,
      default: 'default',
    },
    provider: {
      type: String,
      enum: CAPTCHA_PROVIDER_KEYS,
      default: 'none',
    },
    siteKey: { type: String, default: '', trim: true, maxlength: 200 },
    secretKey: { type: String, default: '' },
  },
  { timestamps: true },
);

export const CaptchaSettingsModel = model<CaptchaSettingsDoc>(
  'CaptchaSettings',
  captchaSettingsSchema,
);
