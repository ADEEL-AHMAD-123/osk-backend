import { decryptSecret, encryptSecret } from '../../shared/crypto/secrets';
import { env } from '../../config/env';
import {
  DEFAULT_BANK_INSTRUCTIONS,
  LEGACY_DEFAULT_BANK_INSTRUCTIONS,
  PaymentSettingsModel,
} from './paymentSettings.model';
import { toPaymentSettingsDTO } from './pricing.mapper';
import type { UpdateSettingsInput } from './pricing.schema';
import type { PaymentSettingsDTO } from './pricing.types';

/**
 * Pricing module application layer. After the move to subscriptions,
 * this is purely the operator's payment configuration:
 *  - the singleton `PaymentSettings` document
 *  - encrypted provider credentials, with masked / readiness views
 *  - a `getProviderSecrets` helper used by provider adapters at request
 *    time to read the decrypted values (falling back to env on cold
 *    boot)
 *
 * Per-listing pricing plans + resolver have been removed.
 */

/**
 * Decrypted credentials used by provider adapters at request time. Each
 * field falls back to the env var if the DB hasn't been configured yet,
 * so a fresh deployment still works while the admin is mid-setup.
 */
export interface ProviderSecrets {
  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    apiBase: string;
    webhookId: string;
  };
  paystack: {
    secretKey: string;
  };
}

function dbOrEnv(stored: string, envValue: string | undefined): string {
  const decoded = decryptSecret(stored);
  return decoded || envValue || '';
}

export const pricingService = {
  /* ─── Settings (singleton) ────────────────────────────────────── */

  async getSettings(): Promise<PaymentSettingsDTO> {
    let doc = await PaymentSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await PaymentSettingsModel.create({ singletonKey: 'default' });
    } else if (doc.bankInstructions === LEGACY_DEFAULT_BANK_INSTRUCTIONS) {
      doc.bankInstructions = DEFAULT_BANK_INSTRUCTIONS;
      await doc.save();
    }
    return toPaymentSettingsDTO(doc);
  },

  async updateSettings(
    input: UpdateSettingsInput,
  ): Promise<PaymentSettingsDTO> {
    /* Build a $set object so nested credential fields the caller didn't
     * send aren't blown away. Provider secret values are encrypted on
     * the way in — the schema only allows strings up to 512 chars (raw),
     * which compresses to ~700 chars of ciphertext (well under the
     * default mongoose string cap). */
    const update: Record<string, unknown> = {};

    if (typeof input.paymentsEnabled === 'boolean') {
      update.paymentsEnabled = input.paymentsEnabled;
    }
    if (Array.isArray(input.enabledProviders)) {
      update.enabledProviders = input.enabledProviders;
    }
    if (typeof input.bankInstructions === 'string') {
      update.bankInstructions = input.bankInstructions;
    }

    /* Stripe — encrypt each provided field before persisting. */
    if (input.stripe) {
      if (typeof input.stripe.secretKey === 'string') {
        update['stripe.secretKey'] = encryptSecret(input.stripe.secretKey);
      }
      if (typeof input.stripe.webhookSecret === 'string') {
        update['stripe.webhookSecret'] = encryptSecret(
          input.stripe.webhookSecret,
        );
      }
    }
    if (input.paypal) {
      if (typeof input.paypal.clientId === 'string') {
        update['paypal.clientId'] = encryptSecret(input.paypal.clientId);
      }
      if (typeof input.paypal.clientSecret === 'string') {
        update['paypal.clientSecret'] = encryptSecret(
          input.paypal.clientSecret,
        );
      }
      if (typeof input.paypal.apiBase === 'string') {
        /* apiBase is not a secret — sandbox vs live URL is visible info. */
        update['paypal.apiBase'] = input.paypal.apiBase;
      }
      if (typeof input.paypal.webhookId === 'string') {
        update['paypal.webhookId'] = encryptSecret(input.paypal.webhookId);
      }
    }
    if (input.paystack) {
      if (typeof input.paystack.secretKey === 'string') {
        update['paystack.secretKey'] = encryptSecret(
          input.paystack.secretKey,
        );
      }
    }

    const doc = await PaymentSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      { $set: update, $setOnInsert: { singletonKey: 'default' } },
      { new: true, upsert: true, runValidators: true },
    ).exec();
    return toPaymentSettingsDTO(doc);
  },

  /**
   * Decrypted credentials used by provider adapters at request time.
   * Reads the singleton; for every field, prefers the DB value and
   * falls back to the matching env var so bootstrap deployments still
   * work before the admin has filled anything in.
   */
  async getProviderSecrets(): Promise<ProviderSecrets> {
    let doc = await PaymentSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await PaymentSettingsModel.create({ singletonKey: 'default' });
    }
    return {
      stripe: {
        secretKey: dbOrEnv(doc.stripe?.secretKey ?? '', env.STRIPE_SECRET_KEY),
        webhookSecret: dbOrEnv(
          doc.stripe?.webhookSecret ?? '',
          env.STRIPE_WEBHOOK_SECRET,
        ),
      },
      paypal: {
        clientId: dbOrEnv(doc.paypal?.clientId ?? '', env.PAYPAL_CLIENT_ID),
        clientSecret: dbOrEnv(
          doc.paypal?.clientSecret ?? '',
          env.PAYPAL_CLIENT_SECRET,
        ),
        apiBase:
          doc.paypal?.apiBase ||
          env.PAYPAL_API_BASE ||
          'https://api-m.sandbox.paypal.com',
        webhookId: dbOrEnv(
          doc.paypal?.webhookId ?? '',
          env.PAYPAL_WEBHOOK_ID,
        ),
      },
      paystack: {
        secretKey: dbOrEnv(
          doc.paystack?.secretKey ?? '',
          env.PAYSTACK_SECRET_KEY,
        ),
      },
    };
  },
};
