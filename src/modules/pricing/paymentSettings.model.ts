import { Schema, model, type Document, type Types } from 'mongoose';
import { PROVIDER_KEYS, type ProviderKey } from './pricing.types';

/**
 * Singleton global payment settings.
 *
 * Two layers of state live here:
 *  1. Operational toggles  — `paymentsEnabled`, `enabledProviders`
 *     (which methods sellers see at checkout), `bankInstructions`.
 *  2. Provider credentials — secret keys + webhook secrets per provider,
 *     stored ENCRYPTED (AES-256-GCM, see shared/crypto/secrets). The
 *     admin pastes raw values into `/admin/pricing`; the service layer
 *     encrypts before saving and decrypts at request time.
 *
 * Every credential field is plain `String` here — Mongoose stores
 * whatever we hand it. The encryption boundary is the service, not the
 * schema, so reads/writes look ordinary at the DB layer.
 */

/* ─── credential sub-schemas (per provider) ───────────────────────────── */

export interface StripeCreds {
  secretKey: string;       // sk_live_… or sk_test_… (encrypted at rest)
  webhookSecret: string;   // whsec_… (encrypted at rest)
}

export interface PayPalCreds {
  clientId: string;        // (encrypted, even though technically public)
  clientSecret: string;    // (encrypted)
  apiBase: string;         // plain — sandbox or live REST host
  webhookId: string;       // (encrypted)
}

export interface PaystackCreds {
  secretKey: string;       // sk_live_… or sk_test_… (encrypted)
}

const stripeSchema = new Schema<StripeCreds>(
  {
    secretKey: { type: String, default: '' },
    webhookSecret: { type: String, default: '' },
  },
  { _id: false },
);

const paypalSchema = new Schema<PayPalCreds>(
  {
    clientId: { type: String, default: '' },
    clientSecret: { type: String, default: '' },
    apiBase: {
      type: String,
      default: 'https://api-m.sandbox.paypal.com',
    },
    webhookId: { type: String, default: '' },
  },
  { _id: false },
);

const paystackSchema = new Schema<PaystackCreds>(
  {
    secretKey: { type: String, default: '' },
  },
  { _id: false },
);

export const LEGACY_DEFAULT_BANK_INSTRUCTIONS =
  'Wire your payment to the account below. Once your transfer clears we will mark the listing paid and publish it within one business day.';

export const DEFAULT_BANK_INSTRUCTIONS = [
  'Wire your payment to the account below. Once your transfer clears we will mark the listing paid and publish it within one business day.',
  '',
  'Beneficiary: OSK Real Estate Escrow Ltd.',
  'Bank: North Atlantic Bank',
  'Account number: 0012457789',
  'IBAN: GB82NATB20481200124577',
  'SWIFT/BIC: NATBGB2L',
  'Reference: Use your listing title or property slug',
].join('\n');

export interface PaymentSettingsDoc extends Document {
  _id: Types.ObjectId;
  singletonKey: 'default';
  paymentsEnabled: boolean;
  enabledProviders: ProviderKey[];
  bankInstructions: string;
  stripe: StripeCreds;
  paypal: PayPalCreds;
  paystack: PaystackCreds;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<PaymentSettingsDoc>(
  {
    singletonKey: {
      type: String,
      enum: ['default'],
      required: true,
      unique: true,
      default: 'default',
    },
    paymentsEnabled: { type: Boolean, default: false },
    enabledProviders: {
      type: [String],
      enum: PROVIDER_KEYS,
      default: ['stripe', 'paypal', 'paystack', 'bank-transfer'],
    },
    bankInstructions: {
      type: String,
      default: DEFAULT_BANK_INSTRUCTIONS,
    },
    stripe: { type: stripeSchema, default: () => ({}) },
    paypal: { type: paypalSchema, default: () => ({}) },
    paystack: { type: paystackSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export const PaymentSettingsModel = model<PaymentSettingsDoc>(
  'PaymentSettings',
  settingsSchema,
);
