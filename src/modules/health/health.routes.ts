import { Router } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from '../../shared/response';
import { redis } from '../../config/redis';

/** Liveness/readiness probe. Reports service + dependency status. */
export const healthRoutes = Router();

healthRoutes.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    dependencies: {
      mongodb: mongoose.connection.readyState === 1 ? 'up' : 'down',
      redis: redis.status === 'ready' ? 'up' : 'down',
    },
    timestamp: new Date().toISOString(),
  });
});
