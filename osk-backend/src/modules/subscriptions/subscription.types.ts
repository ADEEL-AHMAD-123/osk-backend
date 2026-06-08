/**
 * Subscription domain types.
 *
 * A Subscription is the link between a user and one of the catalog
 * SubscriptionPlans. There is at most one ACTIVE subscription per user
 * — switching plans or cancelling rolls the existing row's status; the
 * service never creates parallel actives.
 */

export const SUBSCRIPTION_STATUSES = [
  /** Waiting for the initial payment to clear. */
  'pending-payment',
  /** Payment cleared, currentPeriodEnd in the future. */
  'active',
  /** Admin or seller cancelled — stays "active" until period end then expires. */
  'cancelled',
  /** Period elapsed and no renewal. */
  'expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionDTO {
  id: string;
  userId: string;
  planId: string;
  planSlug: string;
  status: SubscriptionStatus;
  /** ISO 8601 — first activation. */
  startedAt: string | null;
  /** ISO 8601 — when access lapses unless paid again. */
  currentPeriodEnd: string | null;
  /** ISO 8601 — when the seller hit Cancel. */
  cancelledAt: string | null;
  /** Most recent payment intent on this subscription. */
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
}
