import type { PaymentDoc } from './payment.model';
import type { PaymentDTO } from './payment.types';

export function toPaymentDTO(doc: PaymentDoc): PaymentDTO {
  const metadata: Record<string, string> = {};
  for (const [k, v] of doc.metadata?.entries() ?? []) {
    metadata[k] = v;
  }
  return {
    id: doc._id.toString(),
    /* Both property and subscription are optional — only one is set per
     * Payment depending on what's being paid for. Empty string when
     * neither, so the DTO stays a flat shape for the frontend. */
    propertyId: doc.property?.toString() ?? '',
    subscriptionId: doc.subscription?.toString() ?? null,
    userId: doc.user.toString(),
    provider: doc.provider,
    status: doc.status,
    amount: doc.amount,
    currency: doc.currency,
    providerRef: doc.providerRef,
    metadata,
    proofUrl: doc.proofUrl,
    proofUploadedAt: doc.proofUploadedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
