import { decryptSecret, maskSecret } from '../../shared/crypto/secrets';
import type { MaskedSecretField } from '../pricing/pricing.types';
import type { EmailSettingsDoc } from './emailSettings.model';
import type { EmailSettingsDTO } from './emailSettings.types';

function mask(raw: string): MaskedSecretField {
  return raw.length > 0
    ? { configured: true, hint: maskSecret(raw) }
    : { configured: false, hint: '' };
}

/**
 * True when the selected provider has the minimum config it needs:
 *
 *  - console  → always ready (no-op send).
 *  - resend   → API key + non-empty from address.
 *  - smtp     → host + user + password + from address.
 */
function computeReady(doc: EmailSettingsDoc): boolean {
  if (doc.provider === 'console') return true;
  if (!doc.fromAddress) return false;
  if (doc.provider === 'resend') {
    return decryptSecret(doc.resendApiKey).length > 0;
  }
  if (doc.provider === 'smtp') {
    return (
      !!doc.smtp?.host &&
      !!doc.smtp?.user &&
      decryptSecret(doc.smtp?.password ?? '').length > 0
    );
  }
  return false;
}

export function toEmailSettingsDTO(doc: EmailSettingsDoc): EmailSettingsDTO {
  return {
    provider: doc.provider,
    activeTemplate: doc.activeTemplate ?? 'warm',
    fromAddress: doc.fromAddress,
    fromName: doc.fromName,
    resend: {
      apiKey: mask(decryptSecret(doc.resendApiKey ?? '')),
    },
    smtp: {
      host: doc.smtp?.host ?? '',
      port: doc.smtp?.port ?? 587,
      secure: !!doc.smtp?.secure,
      user: doc.smtp?.user ?? '',
      password: mask(decryptSecret(doc.smtp?.password ?? '')),
    },
    ready: computeReady(doc),
  };
}
