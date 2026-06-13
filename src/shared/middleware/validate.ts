import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

/** Validate + coerce the request body against a Zod schema. */
export const validateBody =
  (schema: ZodSchema): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };

/** Validate + coerce the request query string against a Zod schema. */
export const validateQuery =
  (schema: ZodSchema): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    req.query = result.data as typeof req.query;
    next();
  };
