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

/** Pull the calling origin off either the `Origin` header (XHR /
 *  fetch) or the `Referer` host (top-level navigations). Returns just
 *  the hostname (e.g. `oskbooking.com`) so log lines stay short. */
function extractOrigin(
  headers: Record<string, string | string[] | undefined>,
): string {
  const raw =
    (typeof headers.origin === 'string' && headers.origin) ||
    (typeof headers.referer === 'string' && headers.referer) ||
    '';
  if (!raw) return '';
  try {
    return new URL(raw).host;
  } catch {
    return '';
  }
}

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
      /* Quiet successful preflight + health/static checks. Warn on
       * 4xx so client errors are visible without drowning the log.
       * Error on 5xx so server faults stand out at a glance. */
      customLogLevel: (req, res, err) => {
        /* Use originalUrl everywhere — req.url gets stripped by
         * Express's sub-routers as the request descends through
         * `app.use('/api/v1', ...)` → `router.use('/properties', ...)`,
         * so by the time pino-http reads it the prefix is gone. The
         * originalUrl is the verbatim path the client requested. */
        const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '';
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        if (req.method === 'OPTIONS') return 'silent';
        if (url.startsWith(`${env.API_PREFIX}/health`)) return 'silent';
        if (url.startsWith('/uploads/')) return 'silent';
        return 'info';
      },
      /* Plain English one-liners. The pretty-printer's messageFormat
       * (see config/logger.ts) appends the origin domain + requestId,
       * so this just carries the HTTP-verb / URL / status. */
      customSuccessMessage: (req, res) => {
        const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '';
        return `${req.method} ${url} → ${res.statusCode}`;
      },
      customErrorMessage: (req, res) => {
        const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '';
        return `${req.method} ${url} → ${res.statusCode}`;
      },
      /* Drop headers / cookies / remote address from the logged
       * record — the serializer only keeps what we display. */
      serializers: {
        req: (req) => ({
          method: req.method,
          url:
            (req as unknown as { originalUrl?: string }).originalUrl ??
            req.url,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      /* Surface the Origin (or Referer host) so every line in the log
       * tells us "which frontend domain made this call". Multi-domain
       * deploys benefit a lot — you can grep by domain. */
      customProps: (req, res) => ({
        requestId: res.locals.requestId,
        origin: extractOrigin(req.headers as Record<string, string | string[] | undefined>),
      }),
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
