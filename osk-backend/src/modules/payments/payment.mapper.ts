import type { PaymentDoc } from './payment.model';
import type { PaymentDTO } from './payment.types';

export function toPaymentDTO(doc: PaymentDoc): PaymentDTO {
  const metadata: Record<string, string> = {};
  for (const [k, v] of doc.metadata?.entries() ?? []) {
    metadata[k] = v;
  }
  return {
    id: doc._id.toString(),
    propertyId: doc.property.toString(),
    userId: doc.user.toString(),
    provider: doc.provider,
    status: doc.status,
    amount: doc.amount,
    currency: doc.currency,
    providerRef: doc.providerRef,
    metadata,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
