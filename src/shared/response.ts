import type { Response } from 'express';

/**
 * The single API response envelope. Every controller responds through
 * `sendSuccess` / `sendError` so success and error shapes never drift.
 * Mirrors osk-frontend/src/contracts/common.ts.
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface SuccessOptions {
  status?: number;
  meta?: PaginationMeta | Record<string, unknown>;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: SuccessOptions = {},
): Response {
  return res.status(options.status ?? 200).json({
    success: true,
    data,
    ...(options.meta ? { meta: options.meta } : {}),
    requestId: res.locals.requestId,
  });
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown[],
): Response {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    requestId: res.locals.requestId,
  });
}

/** Build a pagination meta block from raw counts. */
export function buildMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
