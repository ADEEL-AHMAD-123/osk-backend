import type { EmailProviderKey, EmailTemplateKey } from './emailSettings.model';
import type { MaskedSecretField } from '../pricing/pricing.types';

export type { EmailProviderKey, EmailTemplateKey };
export { EMAIL_PROVIDER_KEYS, EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS } from './emailSettings.model';

/**
 * Admin-facing email-settings DTO. Secrets are never returned raw —
 * the admin sees a masked "•••• abcd" hint plus a `configured` flag
 * (same pattern as the payment provider credentials).
 */
export interface EmailSettingsDTO {
  provider: EmailProviderKey;
  activeTemplate: EmailTemplateKey;
  fromAddress: string;
  fromName: string;
  resend: {
    apiKey: MaskedSecretField;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: MaskedSecretField;
  };
  /**
   * Computed server-side — true when the chosen provider has the
   * minimum credentials it needs to actually send mail.
   */
  ready: boolean;
}
