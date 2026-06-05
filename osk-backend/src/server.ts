import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase } from './config/db';
import { connectRedis } from './config/redis';
import { initSocket } from './realtime/io';
import { runBootMigrations } from './migrations/runOnBoot';

/** Process bootstrap: connect services, start HTTP + Socket.IO, handle signals. */
async function bootstrap(): Promise<void> {
  await connectDatabase();
  /* Idempotent housekeeping that should run every time the API starts —
   * e.g. backfilling fields added in a later release for older docs that
   * were created before the field existed. Safe to re-run. */
  await runBootMigrations();
  await connectRedis();

  const app = createApp();
  const httpServer = createServer(app);

  /* Realtime gateway — JWT-authed thread rooms, fans out chat messages
   * pushed by the threads service via emitThreadMessage(). */
  initSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`OSK API ready at http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    httpServer.close(() => process.exit(0));
    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'failed to start OSK API');
  process.exit(1);
});
