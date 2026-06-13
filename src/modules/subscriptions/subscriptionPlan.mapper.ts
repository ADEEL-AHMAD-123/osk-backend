import type { SubscriptionPlanDoc } from './subscriptionPlan.model';
import type { SubscriptionPlanDTO } from './subscriptionPlan.types';

export function toSubscriptionPlanDTO(
  doc: SubscriptionPlanDoc,
): SubscriptionPlanDTO {
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    name: doc.name,
    tagline: doc.tagline,
    prices: doc.prices.map((p) => ({
      currency: p.currency,
      amount: p.amount,
    })),
    interval: doc.interval,
    features: doc.features.map((f) => ({
      label: f.label,
      included: f.included,
      key: f.key,
      limit: f.limit ?? undefined,
    })),
    sortOrder: doc.sortOrder,
    highlight: doc.highlight,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
