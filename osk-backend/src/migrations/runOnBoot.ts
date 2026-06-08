import { logger } from '../config/logger';
import { PropertyModel } from '../modules/properties/property.model';
import { SubscriptionPlanModel } from '../modules/subscriptions/subscriptionPlan.model';

/**
 * Idempotent boot-time migrations.
 *
 * These run every time the API starts and must be safe to re-run on an
 * already-migrated database. Each one logs the rows it touched so the
 * operator can spot anomalies.
 *
 * To add a new migration: write a tiny async function and call it from
 * runBootMigrations(). Keep these targeted at backfilling fields added
 * in a later release for documents that pre-date the field.
 */

/** Backfill `country = 'US'` on any property where the field is missing
 *  or null. Pre-country listings were created before this column existed
 *  and the old default was a US-centric dataset, so 'US' is the correct
 *  historical value. */
async function backfillPropertyCountry(): Promise<void> {
  const filter = {
    $or: [{ country: { $exists: false } }, { country: null }, { country: '' }],
  };
  const count = await PropertyModel.countDocuments(filter).exec();
  if (count === 0) return;
  const result = await PropertyModel.updateMany(filter, {
    $set: { country: 'US' },
  }).exec();
  logger.info(
    { matched: count, modified: result.modifiedCount },
    'migration: backfilled property.country=US',
  );
}

/**
 * Ensure the base subscription catalog exists for /admin/plans and public
 * /pricing. Upserts by stable slug so reruns are safe.
 */
async function ensureSubscriptionCatalog(): Promise<void> {
  const plans = [
    {
      slug: 'free',
      name: 'Free',
      tagline: 'Start publishing at zero cost',
      prices: [],
      interval: 'month' as const,
      sortOrder: 1,
      highlight: false,
      active: true,
      features: [
        { label: 'Agency Profile', included: true, key: 'agencyProfile' },
        { label: '1 Agent', included: true, key: 'agents', limit: 1 },
        {
          label: '5 Property Submission',
          included: true,
          key: 'submissions',
          limit: 5,
        },
        { label: 'Featured Property', included: false, key: 'featured' },
        { label: 'Top Property', included: false, key: 'top' },
        { label: 'Urgent Property', included: false, key: 'urgent' },
      ],
    },
    {
      slug: 'gold',
      name: 'Gold',
      tagline: 'For growing agencies',
      prices: [
        { currency: 'USD', amount: 99 },
        { currency: 'NGN', amount: 99000 },
      ],
      interval: 'month' as const,
      sortOrder: 2,
      highlight: false,
      active: true,
      features: [
        { label: 'Agency Profile', included: true, key: 'agencyProfile' },
        { label: '10 Agent', included: true, key: 'agents', limit: 10 },
        {
          label: '20 Property Submission',
          included: true,
          key: 'submissions',
          limit: 20,
        },
        {
          label: 'Featured Property',
          included: true,
          key: 'featured',
          limit: 5,
        },
        { label: 'Top Property', included: true, key: 'top', limit: 2 },
        { label: 'Urgent Property', included: true, key: 'urgent', limit: 2 },
      ],
    },
    {
      slug: 'premium',
      name: 'Premium',
      tagline: 'Maximum visibility and scale',
      prices: [
        { currency: 'USD', amount: 199 },
        { currency: 'NGN', amount: 199000 },
      ],
      interval: 'month' as const,
      sortOrder: 3,
      highlight: true,
      active: true,
      features: [
        { label: 'Agency Profile', included: true, key: 'agencyProfile' },
        { label: 'Unlimited Agent', included: true, key: 'agents', limit: null },
        {
          label: 'Unlimited Property Submission',
          included: true,
          key: 'submissions',
          limit: null,
        },
        {
          label: 'Featured Property',
          included: true,
          key: 'featured',
          limit: null,
        },
        { label: 'Top Property', included: true, key: 'top', limit: null },
        { label: 'Urgent Property', included: true, key: 'urgent', limit: null },
        { label: 'Amenities', included: true, key: 'amenities' },
        {
          label: 'Nearest Location',
          included: true,
          key: 'nearestLocation',
        },
      ],
    },
  ];

  for (const plan of plans) {
    await SubscriptionPlanModel.updateOne(
      { slug: plan.slug },
      { $set: plan },
      { upsert: true },
    ).exec();
  }

  logger.info(
    { slugs: plans.map((p) => p.slug) },
    'migration: ensured base subscription catalog',
  );
}

export async function runBootMigrations(): Promise<void> {
  try {
    await backfillPropertyCountry();
    await ensureSubscriptionCatalog();
  } catch (err) {
    /* Log but don't crash — a migration glitch shouldn't take the API
     * offline. The operator can investigate the log. */
    logger.error({ err }, 'boot migration failed (continuing)');
  }
}
