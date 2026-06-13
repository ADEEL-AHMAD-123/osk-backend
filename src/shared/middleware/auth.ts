import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { ForbiddenError, UnauthorizedError } from '../errors';

export type UserRole = 'buyer' | 'seller' | 'agent' | 'admin';

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(header?: string): string | null {
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Requires a valid access token; attaches `req.user`. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractToken(req.headers.authorization);
  if (!token) return next(new UnauthorizedError());
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
    req.user = { id: payload.id, role: payload.role, email: payload.email };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
};

/**
 * Role-based authorization. Use after `authenticate`:
 *   router.post('/', authenticate, authorize('agent', 'admin'), handler)
 */
export const authorize =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }
    next();
  };

/** Populates `req.user` if a valid token is present, but never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req.headers.authorization);
  if (token) {
    try {
      req.user = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
    } catch {
      /* anonymous request — leave req.user undefined */
    }
  }
  next();
};
