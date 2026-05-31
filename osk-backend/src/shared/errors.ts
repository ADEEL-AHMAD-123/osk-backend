/**
 * Domain error hierarchy. Throw these from any layer; the central error
 * handler maps them to the standard error envelope.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

interface ZodIssueShape {
  path?: (string | number)[];
  message?: string;
}

interface ValidationField {
  field: string;
  message: string;
}

function looksLikeZodIssue(x: unknown): x is ZodIssueShape {
  return (
    !!x &&
    typeof x === 'object' &&
    ('path' in x || 'message' in x) &&
    typeof (x as { message?: unknown }).message === 'string'
  );
}

function normalizeIssue(x: ZodIssueShape): ValidationField {
  const path = Array.isArray(x.path) ? x.path : [];
  const field = path.length > 0 ? path.join('.') : '_root';
  return { field, message: x.message ?? 'Invalid value' };
}

function fieldLabel(field: string): string {
  if (!field || field === '_root') return '';
  const leaf = field.split('.').pop() ?? field;
  return leaf
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export class ValidationError extends AppError {
  constructor(details: unknown[]) {
    /* Normalize: if the caller handed us raw Zod issues, turn them into the
     * { field, message } shape clients expect, and surface a friendly first
     * message instead of the generic "Request validation failed". */
    const normalized: ValidationField[] = details.map((d) =>
      looksLikeZodIssue(d)
        ? normalizeIssue(d)
        : { field: '_root', message: String((d as { message?: string })?.message ?? d) },
    );
    const first = normalized[0];
    const label = first ? fieldLabel(first.field) : '';
    const message = first
      ? label
        ? `${label}: ${first.message}`
        : first.message
      : 'Please review your input and try again.';
    super(422, 'VALIDATION_ERROR', message, normalized);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, 'CONFLICT', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, 'RATE_LIMITED', message);
  }
}

export class NotImplementedError extends AppError {
  constructor(message = 'This endpoint is not implemented yet') {
    super(501, 'NOT_IMPLEMENTED', message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(503, 'SERVICE_UNAVAILABLE', message);
  }
}
