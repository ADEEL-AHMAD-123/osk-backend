import bcrypt from 'bcryptjs';
import type { Types } from 'mongoose';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from '../../shared/errors';
import { logger } from '../../config/logger';
import { isProd } from '../../config/env';
import { authRepository } from './auth.repository';
import { sendPasswordResetEmail, sendVerifyEmail } from './auth.emails';
import { sendWelcomeEmail } from '../../shared/email/notificationEmails';
import {
  createOpaqueToken,
  createRefreshToken,
  hashToken,
  newTokenFamily,
  refreshTokenExpiry,
  signAccessToken,
} from './auth.tokens';
import type { UserDoc, UserRole } from './user.model';
import type { LoginInput, RegisterInput } from './auth.schema';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** The authenticated user as exposed to clients — no secrets. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  avatarUrl?: string;
}

export interface AuthResult {
  user: SessionUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}

/** AuthResult plus the raw refresh token the controller sets as an httpOnly cookie. */
export interface AuthIssue {
  result: AuthResult;
  refreshToken: string;
}

function toSessionUser(user: UserDoc): SessionUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
  };
}

/** Issue an access JWT + a refresh token within a rotation family. */
async function issueTokens(user: UserDoc, family: string): Promise<AuthIssue> {
  const { token: accessToken, expiresAt } = signAccessToken({
    id: user._id.toString(),
    role: user.role,
    email: user.email,
  });
  const { token: refreshToken, hash } = createRefreshToken();
  await authRepository.saveRefreshToken({
    user: user._id,
    tokenHash: hash,
    family,
    expiresAt: refreshTokenExpiry(),
  });
  return {
    result: {
      user: toSessionUser(user),
      accessToken,
      accessTokenExpiresAt: expiresAt.toISOString(),
    },
    refreshToken,
  };
}

export const authService = {
  async register(
    input: RegisterInput,
    ctx: { origin?: string | null } = {},
  ): Promise<AuthIssue> {
    if (await authRepository.emailTaken(input.email)) {
      throw new ConflictError('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const verify = createOpaqueToken();
    const user = await authRepository.createUser({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      emailVerifyTokenHash: verify.hash,
      /* Stamp the signup origin so background email flows in the
       * future (subscription webhook activations, admin-triggered
       * property reviews) can construct links pointing back to the
       * same domain. */
      lastOrigin: ctx.origin ?? undefined,
    });
    /* Deliver the verification link. Send is fire-and-forget — a delivery
     * blip must not block registration. The email module handles its own
     * error logging. The dev console adapter still surfaces the token in
     * pino so it's testable without a real mail server. */
    void sendVerifyEmail({
      to: user.email,
      name: user.name,
      token: verify.token,
      requestOrigin: ctx.origin,
    });
    /* Welcome on top of the verify link — they're conceptually separate
     * (verify proves email ownership, welcome introduces the product),
     * so they're sent as two messages rather than merged. */
    void sendWelcomeEmail({
      to: user.email,
      name: user.name,
      requestOrigin: ctx.origin,
    });
    logger.info(
      { email: user.email, verifyToken: isProd ? undefined : verify.token },
      'email verification token issued',
    );
    return issueTokens(user, newTokenFamily());
  },

  async login(
    input: LoginInput,
    ctx: { origin?: string | null } = {},
  ): Promise<AuthIssue> {
    const user = await authRepository.findUserByEmail(input.email, true);
    // Same error whether the email or the password is wrong (no enumeration).
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid email or password');
    }
    if (user.status === 'blocked') {
      throw new ForbiddenError('This account has been suspended');
    }
    /* Refresh the stored lastOrigin every login so background-flow
     * emails always point to wherever the user most recently signed
     * in. Skip if origin didn't change to avoid wasted writes. */
    if (ctx.origin && user.lastOrigin !== ctx.origin) {
      user.lastOrigin = ctx.origin;
      await user.save();
    }
    return issueTokens(user, newTokenFamily());
  },

  /** Refresh-token rotation with reuse detection. */
  async refresh(presentedToken: string | undefined): Promise<AuthIssue> {
    if (!presentedToken) throw new UnauthorizedError('Missing refresh token');

    const record = await authRepository.findRefreshByHash(
      hashToken(presentedToken),
    );
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Session expired — please sign in again');
    }

    if (record.used) {
      // An already-rotated token was presented again → probable theft.
      // Burn the whole family so the attacker and victim are both logged out.
      await authRepository.revokeFamily(record.family);
      logger.warn({ family: record.family }, 'refresh token reuse detected');
      throw new UnauthorizedError('Session expired — please sign in again');
    }

    await authRepository.markRefreshUsed(record._id);
    const user = await authRepository.findUserById(record.user.toString());
    if (!user || user.status === 'blocked') {
      await authRepository.revokeFamily(record.family);
      throw new UnauthorizedError('Session is no longer valid');
    }
    // New token stays in the same family — the chain continues.
    return issueTokens(user, record.family);
  },

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    const record = await authRepository.findRefreshByHash(
      hashToken(presentedToken),
    );
    if (record) await authRepository.revokeFamily(record.family);
  },

  async getById(userId: string): Promise<SessionUser> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new UnauthorizedError('Session is no longer valid');
    return toSessionUser(user);
  },

  async verifyEmail(token: string): Promise<void> {
    const user = await authRepository.findUserByVerifyHash(hashToken(token));
    if (!user) {
      throw new UnauthorizedError('Invalid or expired verification link');
    }
    user.emailVerified = true;
    user.emailVerifyTokenHash = undefined;
    await user.save();
  },

  /** Always resolves — never reveals whether an account exists. */
  async forgotPassword(
    email: string,
    ctx: { origin?: string | null } = {},
  ): Promise<void> {
    const user = await authRepository.findUserByEmail(email);
    if (!user) return;
    const reset = createOpaqueToken();
    user.passwordResetTokenHash = reset.hash;
    user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    if (ctx.origin && user.lastOrigin !== ctx.origin) {
      user.lastOrigin = ctx.origin;
    }
    await user.save();
    void sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token: reset.token,
      requestOrigin: ctx.origin,
      userOrigin: user.lastOrigin,
    });
    logger.info(
      { email: user.email, resetToken: isProd ? undefined : reset.token },
      'password reset token issued',
    );
  },

  async resetPassword(token: string, password: string): Promise<void> {
    const user = await authRepository.findUserByResetHash(hashToken(token));
    if (!user) {
      throw new UnauthorizedError('Invalid or expired reset link');
    }
    user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    // Revoke every existing session — the password just changed.
    await authRepository.revokeAllForUser(user._id as Types.ObjectId);
  },

  /**
   * Change the password of an already-signed-in user. Verifies the current
   * password first, then revokes every refresh-token family on the account
   * so other devices are signed out — the caller's NEW session is issued
   * by the controller right after.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserDoc> {
    const user = await authRepository.findUserByIdWithPassword(userId);
    if (!user) throw new UnauthorizedError('Session is no longer valid');

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();

    await authRepository.revokeAllForUser(user._id as Types.ObjectId);
    return user;
  },

  /**
   * Mint a fresh session for a user we already trust (e.g. straight after
   * a change-password where the caller's old refresh family was revoked).
   * Skips password validation entirely.
   */
  async loginExisting(userId: string): Promise<AuthIssue> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new UnauthorizedError('Session is no longer valid');
    if (user.status === 'blocked') {
      throw new ForbiddenError('This account has been suspended');
    }
    return issueTokens(user, newTokenFamily());
  },

  /**
   * Re-issue an email verification token for the signed-in user. Quietly
   * no-ops if the email is already verified — clients shouldn't be able
   * to spam the mail server by hammering "resend".
   *
   * `ctx.origin` is the live request Origin. It wins over the user's
   * stored `lastOrigin` so the verification link points to whichever
   * domain the seller clicked "Resend" from RIGHT NOW — even if they
   * previously logged in elsewhere. The stored value is also refreshed
   * so any background email that fires next uses the new domain too.
   */
  async resendVerification(
    userId: string,
    ctx: { origin?: string | null } = {},
  ): Promise<{ alreadyVerified: boolean }> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new UnauthorizedError('Session is no longer valid');
    if (user.emailVerified) return { alreadyVerified: true };

    const verify = createOpaqueToken();
    user.emailVerifyTokenHash = verify.hash;
    if (ctx.origin && user.lastOrigin !== ctx.origin) {
      user.lastOrigin = ctx.origin;
    }
    await user.save();

    void sendVerifyEmail({
      to: user.email,
      name: user.name,
      token: verify.token,
      requestOrigin: ctx.origin,
      userOrigin: user.lastOrigin,
    });
    logger.info(
      { email: user.email, verifyToken: isProd ? undefined : verify.token },
      'email verification token re-issued',
    );
    return { alreadyVerified: false };
  },
};
