import { decryptSecret, encryptSecret } from '../../shared/crypto/secrets';
import { GoogleAuthSettingsModel } from './googleAuthSettings.model';
import { toGoogleAuthSettingsDTO } from './googleAuthSettings.mapper';
import type { UpdateGoogleAuthSettingsInput } from './googleAuthSettings.schema';
import type {
  GoogleAuthPublicConfig,
  GoogleAuthSettingsDTO,
} from './googleAuthSettings.types';

/* ─────────────────────────────────────────────────────────────────
 * Google OAuth settings + token exchange service.
 *
 *   - getSettings        admin read — secret masked
 *   - getPublicConfig    no-auth — enabled flag + callback URL
 *   - updateSettings     admin write — secret encrypted on the way in
 *   - getDecryptedKeys   used by the start/callback routes
 *   - exchangeCodeForIdToken — POSTs to oauth2.googleapis.com/token
 *   - verifyIdToken      verifies the ID token's signature + claims
 *                        against Google's JWKS via google-auth-library
 *
 * Calling either getPublicConfig or exchange/verify methods when the
 * settings doc is missing / disabled returns null safely — the route
 * layer maps those to a 404 so disabled deploys behave sanely.
 * ──────────────────────────────────────────────────────────────── */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cachedClient: import('google-auth-library').OAuth2Client | null = null;
let cachedClientId: string | null = null;

async function getOAuthClient(
  clientId: string,
): Promise<import('google-auth-library').OAuth2Client> {
  /* Lazy-import google-auth-library so the dependency is only loaded
   * when the Google flow is actually used — keeps cold-start lean
   * for deploys that don't enable Google sign-in. */
  if (cachedClient && cachedClientId === clientId) return cachedClient;
  const { OAuth2Client } = await import('google-auth-library');
  cachedClient = new OAuth2Client({ clientId });
  cachedClientId = clientId;
  return cachedClient;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export const googleAuthService = {
  /** Admin-facing — secret is masked. */
  async getSettings(): Promise<GoogleAuthSettingsDTO> {
    let doc = await GoogleAuthSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await GoogleAuthSettingsModel.create({ singletonKey: 'default' });
    }
    return toGoogleAuthSettingsDTO(doc);
  },

  /** Public-facing — frontend uses this to decide whether to show the button. */
  async getPublicConfig(callbackUrl: string): Promise<GoogleAuthPublicConfig> {
    let doc = await GoogleAuthSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await GoogleAuthSettingsModel.create({ singletonKey: 'default' });
    }
    const dto = toGoogleAuthSettingsDTO(doc);
    return { enabled: dto.ready, callbackUrl };
  },

  async updateSettings(
    input: UpdateGoogleAuthSettingsInput,
  ): Promise<GoogleAuthSettingsDTO> {
    const update: Record<string, unknown> = {};
    if (typeof input.enabled === 'boolean') update.enabled = input.enabled;
    if (typeof input.clientId === 'string')
      update.clientId = input.clientId.trim();
    if (typeof input.clientSecret === 'string') {
      update.clientSecret = encryptSecret(input.clientSecret.trim());
    }
    const doc = await GoogleAuthSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      { $set: update, $setOnInsert: { singletonKey: 'default' } },
      { new: true, upsert: true, runValidators: true },
    ).exec();
    return toGoogleAuthSettingsDTO(doc);
  },

  /**
   * Return the decrypted client ID + secret if the integration is
   * enabled and configured — used by the route layer.
   */
  async getDecryptedKeys(): Promise<{
    clientId: string;
    clientSecret: string;
  } | null> {
    const doc = await GoogleAuthSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc || !doc.enabled) return null;
    const clientId = doc.clientId.trim();
    const clientSecret = decryptSecret(doc.clientSecret ?? '').trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  },

  /**
   * Exchange the one-time `code` Google handed us in the callback for
   * an ID token. We don't ask for an access token — we only need the
   * verified identity claims, not a long-lived API session.
   */
  async exchangeCodeForIdToken(opts: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<string | null> {
    const body = new URLSearchParams();
    body.set('code', opts.code);
    body.set('client_id', opts.clientId);
    body.set('client_secret', opts.clientSecret);
    body.set('redirect_uri', opts.redirectUri);
    body.set('grant_type', 'authorization_code');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { id_token?: string };
    return payload.id_token ?? null;
  },

  /**
   * Verify a Google ID token against Google's JWKS and return the
   * subset of claims we care about. Returns null on any verification
   * failure (bad signature, expired, wrong aud, etc.).
   */
  async verifyIdToken(
    idToken: string,
    clientId: string,
  ): Promise<GoogleProfile | null> {
    const client = await getOAuthClient(clientId);
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload) return null;
      if (!payload.sub || !payload.email) return null;
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === true,
        name: payload.name,
        picture: payload.picture,
      };
    } catch {
      return null;
    }
  },
};
