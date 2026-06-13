import { decryptSecret, maskSecret } from '../../shared/crypto/secrets';
import type { GoogleAuthSettingsDoc } from './googleAuthSettings.model';
import type { GoogleAuthSettingsDTO } from './googleAuthSettings.types';

function computeReady(doc: GoogleAuthSettingsDoc): boolean {
  if (!doc.enabled) return false;
  const secret = decryptSecret(doc.clientSecret ?? '').trim();
  return doc.clientId.trim().length > 0 && secret.length > 0;
}

export function toGoogleAuthSettingsDTO(
  doc: GoogleAuthSettingsDoc,
): GoogleAuthSettingsDTO {
  const decryptedSecret = decryptSecret(doc.clientSecret ?? '').trim();
  return {
    enabled: doc.enabled,
    clientId: doc.clientId,
    clientSecret: {
      configured: decryptedSecret.length > 0,
      hint: decryptedSecret ? maskSecret(decryptedSecret) : '',
    },
    ready: computeReady(doc),
  };
}
