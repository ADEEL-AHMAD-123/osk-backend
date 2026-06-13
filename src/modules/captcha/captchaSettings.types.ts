import type { CaptchaProviderKey } from './captchaSettings.model';
import type { MaskedSecretField } from '../pricing/pricing.types';

export type { CaptchaProviderKey };
export { CAPTCHA_PROVIDER_KEYS } from './captchaSettings.model';

export const CAPTCHA_PROVIDER_LABELS: Record<CaptchaProviderKey, string> = {
  none: 'None (disabled)',
  turnstile: 'Cloudflare Turnstile',
  local: 'Built-in text captcha',
};

/**
 * Admin-facing settings DTO. The secret key is masked the same way
 * payment provider keys are: a `configured` flag + last-4 hint, so the
 * admin can confirm what's saved without exposing the value.
 */
export interface CaptchaSettingsDTO {
  provider: CaptchaProviderKey;
  siteKey: string;
  secret: MaskedSecretField;
  /** True when the provider is non-`none` AND siteKey + secret are
   *  set. Drives the public config endpoint's `enabled` field. */
  ready: boolean;
}

/**
 * Public-facing config shape — exposed at GET /captcha/config without
 * auth so the frontend can mount the right widget. Never includes the
 * secret key.
 */
export interface CaptchaPublicConfig {
  provider: CaptchaProviderKey;
  siteKey: string;
  enabled: boolean;
}
