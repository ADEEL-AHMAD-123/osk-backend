import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Email-settings singleton — stores the operator's transactional-email
 * configuration: which provider to use, the From identity, and the
 * provider-specific credentials (encrypted at rest via the shared
 * crypto helper).
 *
 *  - 'console' (default)  → log to pino only; no real send. Safe for dev.
 *  - 'resend'             → API-based send via api.resend.com. Just one
 *                           key to configure; works on Railway / Vercel
 *                           / Render without any port or DNS gymnastics.
 *  - 'smtp'               → any SMTP host. Heavier setup; kept for
 *                           operators who already run their own mail.
 *
 * Note: secret values are stored as the AES-256-GCM ciphertext from
 * `shared/crypto/secrets.ts`. Always decrypt via the same helper.
 */

export const EMAIL_PROVIDER_KEYS = ['console', 'resend', 'smtp'] as const;
export type EmailProviderKey = (typeof EMAIL_PROVIDER_KEYS)[number];

export const EMAIL_TEMPLATE_KEYS = ['warm', 'clean', 'dark', 'brand'] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  warm: 'Warm (ivory background, earthy tones)',
  clean: 'Clean (white, minimal borders)',
  dark: 'Dark (night-mode style)',
  brand: 'Brand (accent-colour header)',
};

export interface EmailSmtpBlock {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Encrypted at rest. */
  password: string;
}

export interface EmailSettingsDoc extends Document {
  _id: Types.ObjectId;
  /** Marker so we can singleton-enforce via a unique index. */
  singletonKey: 'default';
  /** Which adapter `getEmailProvider()` returns at request time. */
  provider: EmailProviderKey;
  /** Which HTML email template to use for transactional emails. */
  activeTemplate: EmailTemplateKey;
  /** Default From address (e.g. "no-reply@yourdomain.com"). */
  fromAddress: string;
  /** Default From display name (e.g. "OSK"). */
  fromName: string;
  /** Resend API key — encrypted at rest. Empty string == not configured. */
  resendApiKey: string;
  smtp: EmailSmtpBlock;
  createdAt: Date;
  updatedAt: Date;
}

const smtpSchema = new Schema<EmailSmtpBlock>(
  {
    host: { type: String, default: '', trim: true, maxlength: 200 },
    port: { type: Number, default: 587 },
    secure: { type: Boolean, default: false },
    user: { type: String, default: '', trim: true, maxlength: 200 },
    password: { type: String, default: '' },
  },
  { _id: false },
);

const emailSettingsSchema = new Schema<EmailSettingsDoc>(
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
      enum: EMAIL_PROVIDER_KEYS,
      default: 'console',
    },
    activeTemplate: {
      type: String,
      enum: EMAIL_TEMPLATE_KEYS,
      default: 'warm',
    },
    fromAddress: { type: String, default: '', trim: true, maxlength: 200 },
    fromName: { type: String, default: 'OSK', trim: true, maxlength: 80 },
    resendApiKey: { type: String, default: '' },
    smtp: {
      type: smtpSchema,
      default: () => ({
        host: '',
        port: 587,
        secure: false,
        user: '',
        password: '',
      }),
    },
  },
  { timestamps: true },
);

export const EmailSettingsModel = model<EmailSettingsDoc>(
  'EmailSettings',
  emailSettingsSchema,
);
