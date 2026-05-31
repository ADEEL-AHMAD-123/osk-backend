import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB. In this shell the failure is non-fatal: the API still
 * boots so the frontend can be developed against in-memory sample data.
 * Once domain modules persist data, make this throw instead.
 */
export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
    logger.info('MongoDB connected');
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'MongoDB unavailable — running in shell mode without persistence',
    );
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
