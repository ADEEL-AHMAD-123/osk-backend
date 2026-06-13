import path from 'node:path';
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { requestId } from './shared/middleware/requestId';
import { errorHandler, notFound } from './shared/middleware/errorHandler';
import { corsOriginResolver } from './shared/cors/originPolicy';
import swaggerUi from 'swagger-ui-express';
import { registerModules } from './modules';
import { openApiSpec } from './openapi/spec';

/**
 * Builds the Express application: edge security/observability middleware,
 * the versioned module router, and the central error handler last.
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  /* Behind Railway / Vercel / any TLS-terminating proxy. Required for
   * express-rate-limit's ip detection and for `secure` cookies to be set
   * (Express otherwise sees req.protocol === 'http'). */
  app.set('trust proxy', 1);

  // Observability — correlation ID first, then structured request logging.
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      /** Quiet successful preflight + health checks; warn on 4xx; error on 5xx. */
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        if (req.method === 'OPTIONS') return 'silent';
        if (req.url?.startsWith(`${env.API_PREFIX}/health`)) return 'silent';
        return 'info';
      },
      /** Plain English one-liners — the verbose envelope is a debug detail. */
      customSuccessMessage: (req, res) =>
        `${req.method} ${req.url} → ${res.statusCode}`,
      customErrorMessage: (req, res) =>
        `${req.method} ${req.url} → ${res.statusCode}`,
      /** Drop headers / cookies / remote address from the logged record. */
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      customProps: (_req, res) => ({ requestId: res.locals.requestId }),
    }),
  );

  // Edge security. Helmet's default CSP blocks cross-origin asset loads
  // from /uploads, so we relax cross-origin-resource-policy here.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  /* CORS — reflect any browser-supplied Origin so new frontends work
   * without env edits. The security model relies on Bearer auth:
   * malicious sites can make the call but can't forge the Authorization
   * header. See `shared/cors/originPolicy.ts` for the details and the
   * optional CORS_BLOCKLIST escape hatch. */
  app.use(
    cors({
      origin: corsOriginResolver,
      credentials: true,
    }),
  );
  app.use(compression());

  // Static media — uploaded property photos / chat attachments. Long cache
  // because filenames are content-hashed and never change.
  app.use(
    '/uploads',
    express.static(path.join(process.cwd(), 'uploads'), {
      maxAge: '7d',
      immutable: true,
      fallthrough: false,
    }),
  );

  // Body parsing.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Input hardening.
  app.use(mongoSanitize());
  app.use(hpp());

  // Baseline rate limit (per-route limiters are layered on top in modules).
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // OpenAPI / Swagger UI — mounted before the API router so /docs is a
  // first-class siblings of the resource routes. Spec is also served as
  // JSON at /docs.json for tooling.
  app.get(`${env.API_PREFIX}/docs.json`, (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(
    `${env.API_PREFIX}/docs`,
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'OSK API · v0.1',
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  // Versioned API surface.
  app.use(env.API_PREFIX, registerModules());

  // 404 + central error handler must be last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
