import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodIssue } from 'zod';
import { AppError } from '../errors';
import { sendError } from '../response';
import { logger } from '../../config/logger';

/** 404 for any unmatched route. */
export const notFound: RequestHandler = (req, res) => {
  sendError(
    res,
    404,
    'NOT_FOUND',
    `Route ${req.method} ${req.originalUrl} not found`,
  );
};

interface FieldIssue {
  field: string;
  message: string;
}

function toFieldIssues(issues: ZodIssue[]): FieldIssue[] {
  return issues.map((i) => ({
    field: i.path.length > 0 ? i.path.join('.') : '_root',
    message: i.message,
  }));
}

/** Turn a Zod issue into a sentence the user can act on. */
function humanZodMessage(issues: ZodIssue[]): string {
  const first = issues[0];
  if (!first) return 'Please review your input and try again.';
  const field = first.path.length > 0 ? String(first.path[first.path.length - 1]) : '';
  const label = field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
  return label ? `${label}: ${first.message}` : first.message;
}

/**
 * Central error handler — the single place errors become responses.
 * Sentry capture is wired here (see TODO) for 5xx errors.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof ZodError) {
    return sendError(
      res,
      422,
      'VALIDATION_ERROR',
      humanZodMessage(err.issues),
      toFieldIssues(err.issues),
    );
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, err.message);
      // TODO(observability): Sentry.captureException(err);
    }
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }

  logger.error({ err, requestId }, 'Unhandled error');
  // TODO(observability): Sentry.captureException(err);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};
