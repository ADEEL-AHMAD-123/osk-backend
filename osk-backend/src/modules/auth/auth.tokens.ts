import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import type { UserRole } from './user.model';

export interface AccessTokenPayload {
  id: string;
  role: UserRole;
  email: string;
}

/** Sign a short-lived access JWT and report its absolute expiry. */
export function signAccessToken(payload: AccessTokenPayload): {
  token: string;
  expiresAt: Date;
} {
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
  const decoded = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(decoded.exp * 1000) };
}

/** Absolute expiry of an already-signed access token. */
export function readAccessTokenExpiry(token: string): Date {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const seconds = decoded?.exp ?? Math.floor(Date.now() / 1000);
  return new Date(seconds * 1000);
}

/** Mint an opaque refresh token; only `hash` is ever persisted. */
export function createRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(40).toString('hex');
  return { token, hash: hashToken(token) };
}

/** Random single-use token (email verification / password reset). */
export function createOpaqueToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newTokenFamily(): string {
  return crypto.randomUUID();
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + durationToMs(env.JWT_REFRESH_TTL));
}

/** Parse a `30s` / `15m` / `12h` / `7d` duration to milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1] ?? '0');
  const unit = match[2] ?? 'd';
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (unitMs[unit] ?? 86_400_000);
}
