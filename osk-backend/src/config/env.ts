import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/** Validated, typed environment. Fails fast on a malformed config. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default('/api/v1'),

  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/osk'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  JWT_ACCESS_SECRET: z.string().min(8).default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(8).default('dev-refresh-secret-change-me'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  SENTRY_DSN: z.string().optional(),

  /* Master pass-phrase used to derive the key that encrypts at-rest
   * secrets (provider keys, webhook secrets). MUST be set in production;
   * in dev we fall back to JWT_ACCESS_SECRET so a fresh `npm run dev`
   * works without extra setup. Rotating it makes already-stored
   * ciphertext unreadable — the admin will need to re-paste their keys. */
  OSK_SECRETS_KEY: z.string().optional(),

  /* ─── Payment provider credentials (bootstrap fallback) ────────────
   * These env vars are now optional and act as a BOOTSTRAP fallback for
   * fresh deploys before the admin has filled in the credentials in
   * `/admin/pricing`. At request time the providers prefer the values
   * stored (encrypted) in the DB. Each key is optional: when both DB
   * and env are missing, the adapter falls back to a sandbox flow that
   * simulates success locally. */
  PUBLIC_APP_URL: z.string().default('http://localhost:3000'),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_API_BASE: z.string().default('https://api-m.sandbox.paypal.com'),
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  PAYSTACK_SECRET_KEY: z.string().optional(),

  /* ─── Transactional email (bootstrap fallback) ─────────────────────
   * The selected provider + credentials live in EmailSettings (DB),
   * editable from /admin/email. These env vars are read only on cold
   * boot before the admin has filled anything in — the DB value
   * takes precedence as soon as it's saved. */
  RESEND_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
