import type { SubscriptionDoc } from './subscription.model';
import type { SubscriptionDTO } from './subscription.types';

export function toSubscriptionDTO(doc: SubscriptionDoc): SubscriptionDTO {
  return {
    id: doc._id.toString(),
    userId: doc.user.toString(),
    planId: doc.plan.toString(),
    planSlug: doc.planSlug,
    status: doc.status,
    startedAt: doc.startedAt ? doc.startedAt.toISOString() : null,
    currentPeriodEnd: doc.currentPeriodEnd
      ? doc.currentPeriodEnd.toISOString()
      : null,
    cancelledAt: doc.cancelledAt ? doc.cancelledAt.toISOString() : null,
    paymentId: doc.payment ? doc.payment.toString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
