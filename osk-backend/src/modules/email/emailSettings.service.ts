import { decryptSecret, encryptSecret } from '../../shared/crypto/secrets';
import { env } from '../../config/env';
import { EmailSettingsModel } from './emailSettings.model';
import type { EmailTemplateKey } from './emailSettings.model';
import { toEmailSettingsDTO } from './emailSettings.mapper';
import type { UpdateEmailSettingsInput } from './emailSettings.schema';
import type { EmailSettingsDTO } from './emailSettings.types';

/**
 * Decrypted credentials passed to the provider adapter. Each field
 * falls back to its env var when the DB hasn't been configured yet,
 * so a fresh Railway deploy with `RESEND_API_KEY` set still works
 * before the admin opens the UI.
 */
export interface EmailProviderSecrets {
  provider: 'console' | 'resend' | 'smtp';
  activeTemplate: EmailTemplateKey;
  fromAddress: string;
  fromName: string;
  resendApiKey: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
}

function dbOrEnv(stored: string, envValue: string | undefined): string {
  const decoded = decryptSecret(stored);
  return decoded || envValue || '';
}

export const emailSettingsService = {
  /** Admin-facing read — secrets are masked. */
  async getSettings(): Promise<EmailSettingsDTO> {
    let doc = await EmailSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await EmailSettingsModel.create({ singletonKey: 'default' });
    }
    return toEmailSettingsDTO(doc);
  },

  /**
   * Patch endpoint. Every secret arrives raw and gets encrypted before
   * landing in mongo. The shape mirrors the pricing/settings handler so
   * partial updates work — the admin can change just the From name
   * without re-pasting the API key.
   */
  async updateSettings(
    input: UpdateEmailSettingsInput,
  ): Promise<EmailSettingsDTO> {
    const update: Record<string, unknown> = {};
    if (typeof input.provider === 'string') update.provider = input.provider;
    if (typeof input.activeTemplate === 'string') update.activeTemplate = input.activeTemplate;
    if (typeof input.fromAddress === 'string') {
      update.fromAddress = input.fromAddress.trim();
    }
    if (typeof input.fromName === 'string') {
      update.fromName = input.fromName.trim();
    }
    if (input.resend) {
      if (typeof input.resend.apiKey === 'string') {
        update.resendApiKey = encryptSecret(input.resend.apiKey);
      }
    }
    if (input.smtp) {
      if (typeof input.smtp.host === 'string') update['smtp.host'] = input.smtp.host.trim();
      if (typeof input.smtp.port === 'number') update['smtp.port'] = input.smtp.port;
      if (typeof input.smtp.secure === 'boolean') update['smtp.secure'] = input.smtp.secure;
      if (typeof input.smtp.user === 'string') update['smtp.user'] = input.smtp.user.trim();
      if (typeof input.smtp.password === 'string') {
        update['smtp.password'] = encryptSecret(input.smtp.password);
      }
    }

    const doc = await EmailSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      { $set: update, $setOnInsert: { singletonKey: 'default' } },
      { new: true, upsert: true, runValidators: true },
    ).exec();
    return toEmailSettingsDTO(doc);
  },

  /**
   * Decrypted credentials the provider adapter consumes at request
   * time. Each field falls back to the matching env var when the DB
   * hasn't been configured yet — so a Railway deploy with
   * `RESEND_API_KEY` and `EMAIL_FROM` set in the dashboard still
   * sends mail before the admin opens the UI.
   */
  async getProviderSecrets(): Promise<EmailProviderSecrets> {
    let doc = await EmailSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await EmailSettingsModel.create({ singletonKey: 'default' });
    }
    /* Env-derived fallback values let a fresh deploy work with just
     * `RESEND_API_KEY` + `EMAIL_FROM` set in Railway. The DB takes
     * precedence as soon as the admin saves anything. */
    const envProvider =
      (process.env.EMAIL_PROVIDER ?? '').toLowerCase() ||
      (process.env.RESEND_API_KEY ? 'resend' : '');
    const provider = (doc.provider !== 'console'
      ? doc.provider
      : envProvider || 'console') as EmailProviderSecrets['provider'];

    return {
      provider,
      activeTemplate: (doc.activeTemplate ?? 'warm') as EmailTemplateKey,
      fromAddress:
        doc.fromAddress || process.env.EMAIL_FROM_ADDRESS || '',
      fromName:
        doc.fromName ||
        process.env.EMAIL_FROM_NAME ||
        process.env.EMAIL_FROM ||
        'OSK',
      resendApiKey: dbOrEnv(doc.resendApiKey ?? '', env.RESEND_API_KEY),
      smtp: {
        host: doc.smtp?.host || process.env.SMTP_HOST || '',
        port: doc.smtp?.port || Number(process.env.SMTP_PORT ?? 587),
        secure:
          typeof doc.smtp?.secure === 'boolean'
            ? doc.smtp.secure
            : (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true',
        user: doc.smtp?.user || process.env.SMTP_USER || '',
        password: dbOrEnv(doc.smtp?.password ?? '', process.env.SMTP_PASSWORD),
      },
    };
  },
};
