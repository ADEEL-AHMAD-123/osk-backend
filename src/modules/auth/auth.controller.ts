import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { sendSuccess } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { env, isProd } from '../../config/env';
import { durationToMs, readAccessTokenExpiry } from './auth.tokens';
import { authService } from './auth.service';
import { captchaService } from '../captcha/captcha.service';
import { ForbiddenError } from '../../shared/errors';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schema';

/** Refresh token travels only as an httpOnly cookie, scoped to the auth routes. */
const REFRESH_COOKIE = 'osk_rt';

function refreshCookieOptions(): CookieOptions {
  /* In prod the frontend (Vercel) and backend (Railway) live on different
   * eTLD+1 domains, so the refresh cookie MUST be SameSite=None + Secure
   * — otherwise the browser drops it on every cross-origin request and
   * token rotation silently fails. Locally we keep SameSite=Lax because
   * Chrome refuses Secure cookies over plain http://localhost. */
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: `${env.API_PREFIX}/auth`,
    maxAge: durationToMs(env.JWT_REFRESH_TTL),
  };
}

/** Exported so federated-identity flows (Google OAuth, etc.) can mint
 *  the same session cookie the password flow does. */
export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[REFRESH_COOKIE];
}

/** POST /auth/register */
export const register: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  /* Captcha gate. `verifyToken` returns true when captcha is
   * disabled, so this check is also the no-op in dev. Returns 403
   * with a clear message on fail so the frontend can show a useful
   * error without revealing whether the email was already taken. */
  const captchaOk = await captchaService.verifyToken(
    input.captchaToken,
    (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.ip) ?? null,
  );
  if (!captchaOk) {
    throw new ForbiddenError(
      'We couldn’t verify the captcha. Refresh the page and try again.',
    );
  }
  const { captchaToken: _t, ...registerInput } = input;
  const { result, refreshToken } = await authService.register(
    registerInput,
    { origin: req.headers.origin ?? null },
  );
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, result, { status: 201 });
};

/** POST /auth/login */
export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const { result, refreshToken } = await authService.login(input, {
    origin: req.headers.origin ?? null,
  });
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, result);
};

/** POST /auth/refresh — rotates the refresh token, returns a new access token. */
export const refresh: RequestHandler = async (req, res) => {
  const { result, refreshToken } = await authService.refresh(
    readRefreshCookie(req),
  );
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, result);
};

/** POST /auth/logout */
export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  sendSuccess(res, { loggedOut: true });
};

/** GET /auth/session — restores the current session (requires authenticate). */
export const session: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const user = await authService.getById(req.user.id);
  const bearer = (req.headers.authorization ?? '').slice(7);
  sendSuccess(res, {
    user,
    accessToken: bearer,
    accessTokenExpiresAt: readAccessTokenExpiry(bearer).toISOString(),
  });
};

/** POST /auth/verify-email */
export const verifyEmail: RequestHandler = async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);
  await authService.verifyEmail(token);
  sendSuccess(res, { verified: true });
};

/** POST /auth/forgot-password — always succeeds (no account enumeration). */
export const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(email, {
    origin: req.headers.origin ?? null,
  });
  sendSuccess(res, { sent: true });
};

/** POST /auth/resend-verification-public — unauthenticated counterpart
 *  to the authed `resendVerification` endpoint. Used when a user gets
 *  bounced at login with EMAIL_NOT_VERIFIED and wants a fresh link
 *  without needing a session first. Reuses the forgot-password schema
 *  (just an email field). Always resolves to avoid enumeration. */
export const resendVerificationPublic: RequestHandler = async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.resendVerificationPublic(email, {
    origin: req.headers.origin ?? null,
  });
  sendSuccess(res, { sent: true });
};

/** POST /auth/reset-password */
export const resetPassword: RequestHandler = async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, password);
  sendSuccess(res, { reset: true });
};

/**
 * POST /auth/change-password — authenticated user updates their password.
 * Verifies the current password, revokes every existing refresh family
 * (so other devices are signed out), then issues a fresh session for
 * the caller so they stay signed in here.
 */
export const changePassword: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(
    req.user.id,
    input.currentPassword,
    input.newPassword,
  );
  /* Mint a fresh session for the caller — the user shouldn't be kicked
   * out of the very tab they just changed their password in. */
  const issued = await authService.loginExisting(req.user.id);
  setRefreshCookie(res, issued.refreshToken);
  sendSuccess(res, issued.result);
};

/** POST /auth/resend-verification — re-issue the email verification link. */
export const resendVerification: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await authService.resendVerification(req.user.id, {
    origin: req.headers.origin ?? null,
  });
  sendSuccess(res, { sent: true, ...result });
};
