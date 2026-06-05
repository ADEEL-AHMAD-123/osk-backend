/**
 * Database seed — `npm run db:seed`.
 *
 * Idempotent: removes the seed users and sample properties, then recreates
 * them. Run it once after starting MongoDB so the frontend has data.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { UserModel } from '../modules/auth/user.model';
import { PropertyModel } from '../modules/properties/property.model';
import { SAMPLE_PROPERTIES } from '../modules/properties/property.data';

const SEED_USERS = [
  { name: 'OSK Admin', email: 'admin@osk.dev', password: 'Admin1234', role: 'admin' as const },
  {
    name: 'Avery Agent',
    email: 'adeeel5598@gmail.com',
    password: 'Agent1234',
    role: 'agent' as const,
  },
];

async function seed(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('connected to MongoDB — seeding');

  // Clean prior seed data so re-runs do not duplicate.
  await UserModel.deleteMany({ email: { $in: SEED_USERS.map((u) => u.email) } });
  await PropertyModel.deleteMany({
    slug: { $in: SAMPLE_PROPERTIES.map((p) => p.slug) },
  });

  const users = await Promise.all(
    SEED_USERS.map(async (u) =>
      UserModel.create({
        name: u.name,
        email: u.email,
        role: u.role,
        emailVerified: true,
        passwordHash: await bcrypt.hash(u.password, 12),
      }),
    ),
  );

  const agent = users.find((u) => u.role === 'agent');
  if (!agent) throw new Error('seed: agent user was not created');

  await PropertyModel.create(
    SAMPLE_PROPERTIES.map((p) => ({ ...p, owner: agent._id })),
  );

  logger.info(
    { users: users.length, properties: SAMPLE_PROPERTIES.length },
    'seed complete',
  );
  logger.info('login credentials (development only):');
  for (const u of SEED_USERS) {
    logger.info(`  ${u.role.padEnd(6)} ${u.email} / ${u.password}`);
  }

  await mongoose.disconnect();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exit(1);
  });
