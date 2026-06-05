/**
 * Symmetric encryption for "at rest" secrets — payment provider keys,
 * webhook secrets, etc. — that admins paste into the dashboard and we
 * persist in MongoDB.
 *
 * Algorithm: AES-256-GCM (authenticated, single-pass).
 * Key derivation: scrypt over a master pass-phrase from `OSK_SECRETS_KEY`,
 * which the operator MUST set in production. In dev we fall back to the
 * JWT access secret so a fresh `npm run dev` works without extra setup.
 *
 * Ciphertext format (single string, base64-safe):
 *   v1:<iv-b64>:<tag-b64>:<ct-b64>
 * The `v1` prefix lets us rotate the format later without breaking older
 * rows — readers will see an unknown prefix and treat the row as empty
 * instead of crashing.
 */
import crypto from 'node:crypto';
import { env } from '../../config/env';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';
/** Fixed application salt — pairing it with the master key derives our
 *  encryption key without exposing the master via a known-plaintext. */
const SALT = 'osk-secrets-salt-v1';

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const passphrase =
    env.OSK_SECRETS_KEY || env.JWT_ACCESS_SECRET || 'osk-dev-fallback';
  cachedKey = crypto.scryptSync(passphrase, SALT, 32);
  return cachedKey;
}

/** Encrypt a plaintext secret. Returns '' for empty input (so callers
 *  can treat empty values uniformly). */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, deriveKey(), iv);
  const ct = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

/** Decrypt previously-encrypted ciphertext. Returns '' on any error
 *  (unknown format, tampered tag, key rotation) — callers must handle
 *  the empty case as "not configured". */
export function decryptSecret(enc: string): string {
  if (!enc) return '';
  const parts = enc.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return '';
  try {
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    const ct = Buffer.from(parts[3]!, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    return '';
  }
}

/** Mask a secret for display — show only the last `keep` characters. */
export function maskSecret(plain: string, keep = 4): string {
  if (!plain) return '';
  if (plain.length <= keep) return '•'.repeat(plain.length);
  return '•'.repeat(Math.min(plain.length - keep, 12)) + plain.slice(-keep);
}
