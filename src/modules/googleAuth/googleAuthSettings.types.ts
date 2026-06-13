import type { MaskedSecretField } from '../pricing/pricing.types';

/**
 * Admin-facing settings DTO. The client secret is masked the same way
 * payment provider keys are.
 */
export interface GoogleAuthSettingsDTO {
  enabled: boolean;
  clientId: string;
  clientSecret: MaskedSecretField;
  /** True when enabled === true AND clientId + decrypted clientSecret are
   *  both present. Drives whether the public config exposes a button. */
  ready: boolean;
}

/**
 * Public-facing config shape — exposed at GET /auth/google/config so
 * the frontend can decide whether to render the "Continue with Google"
 * button. Never includes the client secret.
 */
export interface GoogleAuthPublicConfig {
  enabled: boolean;
  /** The callback URL the operator must paste into Google Cloud. We
   *  compute it on the backend so the admin page can copy-paste it
   *  without typos and so it tracks the live request origin in dev. */
  callbackUrl: string;
}
