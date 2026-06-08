import { decryptSecret, maskSecret } from '../../shared/crypto/secrets';
import type { PaymentSettingsDoc } from './paymentSettings.model';
import type {
  MaskedSecretField,
  PaymentSettingsDTO,
  ProviderKey,
} from './pricing.types';

/** Turn one stored ciphertext into the masked status the admin sees. */
function toMaskedField(encrypted: string): MaskedSecretField {
  const decrypted = decryptSecret(encrypted);
  return {
    configured: decrypted.length > 0,
    hint: decrypted ? maskSecret(decrypted) : '',
  };
}

/**
 * Compute which providers have the minimum credentials they need to
 * actually charge money — surfaced to the admin so the dashboard can
 * show "Active" vs "Needs setup" without re-implementing this check on
 * the frontend.
 *
 *  - stripe  → secretKey at minimum (webhookSecret optional but advised)
 *  - paypal  → clientId + clientSecret + apiBase
 *  - paystack→ secretKey
 *  - bank    → always considered configured (manual flow, no creds)
 */
function computeProviderReady(stored: {
  stripe: { secretKey: string };
  paypal: { clientId: string; clientSecret: string; apiBase: string };
  paystack: { secretKey: string };
}): Record<ProviderKey, boolean> {
  return {
    stripe: stored.stripe.secretKey.length > 0,
    paypal:
      stored.paypal.clientId.length > 0 &&
      stored.paypal.clientSecret.length > 0 &&
      stored.paypal.apiBase.length > 0,
    paystack: stored.paystack.secretKey.length > 0,
    'bank-transfer': true,
  };
}

export function toPaymentSettingsDTO(
  doc: PaymentSettingsDoc,
): PaymentSettingsDTO {
  const stripe = doc.stripe ?? { secretKey: '', webhookSecret: '' };
  const paypal = doc.paypal ?? {
    clientId: '',
    clientSecret: '',
    apiBase: 'https://api-m.sandbox.paypal.com',
    webhookId: '',
  };
  const paystack = doc.paystack ?? { secretKey: '' };

  /* Pre-decrypt once so we can both render the masked hint and compute
   * the readiness map without paying for two decrypts per field. */
  const decoded = {
    stripe: {
      secretKey: decryptSecret(stripe.secretKey),
      webhookSecret: decryptSecret(stripe.webhookSecret),
    },
    paypal: {
      clientId: decryptSecret(paypal.clientId),
      clientSecret: decryptSecret(paypal.clientSecret),
      webhookId: decryptSecret(paypal.webhookId),
      apiBase: paypal.apiBase || 'https://api-m.sandbox.paypal.com',
    },
    paystack: {
      secretKey: decryptSecret(paystack.secretKey),
    },
  };

  const mask = (raw: string): MaskedSecretField => ({
    configured: raw.length > 0,
    hint: raw ? maskSecret(raw) : '',
  });

  return {
    paymentsEnabled: doc.paymentsEnabled,
    enabledProviders: doc.enabledProviders,
    bankInstructions: doc.bankInstructions,
    providers: {
      stripe: {
        secretKey: mask(decoded.stripe.secretKey),
        webhookSecret: mask(decoded.stripe.webhookSecret),
      },
      paypal: {
        clientId: mask(decoded.paypal.clientId),
        clientSecret: mask(decoded.paypal.clientSecret),
        webhookId: mask(decoded.paypal.webhookId),
        apiBase: decoded.paypal.apiBase,
      },
      paystack: {
        secretKey: mask(decoded.paystack.secretKey),
      },
    },
    providerReady: computeProviderReady(decoded),
  };
}

/* `toMaskedField` is left exported in case any tooling imports it. */
export { toMaskedField };
