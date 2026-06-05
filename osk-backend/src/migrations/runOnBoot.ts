import { logger } from '../config/logger';
import { PropertyModel } from '../modules/properties/property.model';

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

export async function runBootMigrations(): Promise<void> {
  try {
    await backfillPropertyCountry();
  } catch (err) {
    /* Log but don't crash — a migration glitch shouldn't take the API
     * offline. The operator can investigate the log. */
    logger.error({ err }, 'boot migration failed (continuing)');
  }
}
