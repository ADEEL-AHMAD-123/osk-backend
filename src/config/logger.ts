import pino from 'pino';
import { env, isProd } from './env';

/**
 * Structured logger (Pino). In dev it pretty-prints; in prod it emits JSON.
 * Request correlation IDs are attached per-request by pino-http (see app.ts).
 */
export const logger = pino({
  level: isProd ? 'info' : 'debug',
  transport: isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  base: { service: 'osk-backend', env: env.NODE_ENV },
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password'],
});
