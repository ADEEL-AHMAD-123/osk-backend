import { decryptSecret, maskSecret } from '../../shared/crypto/secrets';
import type { CaptchaSettingsDoc } from './captchaSettings.model';
import type { CaptchaSettingsDTO } from './captchaSettings.types';

function computeReady(doc: CaptchaSettingsDoc): boolean {
  if (doc.provider === 'none') return false;
  const secret = decryptSecret(doc.secretKey ?? '').trim();
  return doc.siteKey.trim().length > 0 && secret.length > 0;
}

export function toCaptchaSettingsDTO(
  doc: CaptchaSettingsDoc,
): CaptchaSettingsDTO {
  const decryptedSecret = decryptSecret(doc.secretKey ?? '').trim();
  return {
    provider: doc.provider,
    siteKey: doc.siteKey,
    secret: {
      configured: decryptedSecret.length > 0,
      hint: decryptedSecret ? maskSecret(decryptedSecret) : '',
    },
    ready: computeReady(doc),
  };
}
