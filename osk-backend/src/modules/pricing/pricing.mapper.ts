import { decryptSecret, maskSecret } from '../../shared/crypto/secrets';
import type { PricingPlanDoc } from './pricingPlan.model';
import type { PaymentSettingsDoc } from './paymentSettings.model';
import type {
  MaskedSecretField,
  PaymentSettingsDTO,
  PlanListingKind,
  PlanPropertyType,
  PricingPlanDTO,
} from './pricing.types';

export function toPricingPlanDTO(doc: PricingPlanDoc): PricingPlanDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    propertyType: doc.propertyType as PlanPropertyType,
    listingKind: doc.listingKind as PlanListingKind,
    country: doc.country,
    featured: doc.featured,
    price: doc.price,
    currency: doc.currency,
    priority: doc.priority,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Turn one stored ciphertext into the masked status the admin sees. */
function toMaskedField(encrypted: string): MaskedSecretField {
  const decrypted = decryptSecret(encrypted);
  return {
    configured: decrypted.length > 0,
    hint: decrypted ? maskSecret(decrypted) : '',
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

  return {
    paymentsEnabled: doc.paymentsEnabled,
    enabledProviders: doc.enabledProviders,
    bankInstructions: doc.bankInstructions,
    providers: {
      stripe: {
        secretKey: toMaskedField(stripe.secretKey),
        webhookSecret: toMaskedField(stripe.webhookSecret),
      },
      paypal: {
        clientId: toMaskedField(paypal.clientId),
        clientSecret: toMaskedField(paypal.clientSecret),
        webhookId: toMaskedField(paypal.webhookId),
        apiBase: paypal.apiBase || 'https://api-m.sandbox.paypal.com',
      },
      paystack: {
        secretKey: toMaskedField(paystack.secretKey),
      },
    },
  };
}
