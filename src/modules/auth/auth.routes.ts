import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate } from '../../shared/middleware/auth';
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  refresh,
  register,
  resendVerification,
  resetPassword,
  session,
  verifyEmail,
} from './auth.controller';

/**
 * Auth module — presentation layer.
 * JWT access tokens + rotating refresh tokens (httpOnly cookie) with
 * reuse detection. See ../../../docs/ARCHITECTURE.md §1 and §12.
 */
export const authRoutes = Router();

// Brute-force protection on credential + token-bearing endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many attempts — try again later' },
  },
});

authRoutes.post('/register', authLimiter, asyncHandler(register));
authRoutes.post('/login', authLimiter, asyncHandler(login));
authRoutes.post('/refresh', asyncHandler(refresh));
authRoutes.post('/logout', asyncHandler(logout));
authRoutes.get('/session', authenticate, asyncHandler(session));
authRoutes.post('/verify-email', asyncHandler(verifyEmail));
authRoutes.post('/forgot-password', authLimiter, asyncHandler(forgotPassword));
authRoutes.post('/reset-password', authLimiter, asyncHandler(resetPassword));
authRoutes.post(
  '/change-password',
  authLimiter,
  authenticate,
  asyncHandler(changePassword),
);
authRoutes.post(
  '/resend-verification',
  authLimiter,
  authenticate,
  asyncHandler(resendVerification),
);
