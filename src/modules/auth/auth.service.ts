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
import { notificationService } from '../notifications/notification.service';
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
     * pino so it's testable without a real mail server.
     *
     * The verify email already opens with a welcoming greeting and a
     * single clear action ("Verify email"), so we deliberately do NOT
     * send a separate welcome email at password signup — two messages
     * arriving at the same moment is confusing and tempts users into
     * clicking the welcome CTA (which goes to /dashboard) instead of
     * the verify link, leaving them stuck behind the "verify your
     * email" banner. Google signups still get a welcome email because
     * they're auto-verified and never receive a verify link. */
    void sendVerifyEmail({
      to: user.email,
      name: user.name,
      token: verify.token,
      requestOrigin: ctx.origin,
    });
    /* In-app welcome notification so the bell shows a 1 the first
     * time the new user opens their dashboard. */
    void notificationService
      .notify({
        userId: user._id,
        type: 'user.welcome',
        title: `Welcome to OSK, ${user.name.split(' ')[0] ?? user.name}`,
        body: 'Browse listings, save favourites, or list your first property — your dashboard is ready.',
        href: '/dashboard',
      })
      .catch((err) => logger.warn({ err }, 'welcome notification skipped'));
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
    /* Same error whether the email or the password is wrong (no
     * enumeration). Also a Google-only account has no passwordHash —
     * we want it to land here too rather than throw a 500. */
    if (
      !user ||
      !user.passwordHash ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedError('Invalid email or password');
    }
    if (user.status === 'blocked') {
      throw new ForbiddenError('This account has been suspended');
    }
    /* Email-verification gate. We refuse to issue a session until the
     * user has clicked the link we sent at signup. Re-send a fresh
     * link on every blocked login so they always have a working one
     * in their inbox — but rate-limited at the controller layer. */
    if (!user.emailVerified) {
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
      /* Custom code so the frontend can render a "Check your inbox"
       * panel with a Resend button instead of the generic banner. */
      throw new ForbiddenError(
        'Please verify your email — we just sent a fresh link to your inbox.',
        'EMAIL_NOT_VERIFIED',
      );
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

    /* Drop an in-app note so the bell explicitly says "verified" —
     * useful since the verify flow returns to a marketing page and
     * the user might wonder whether anything actually happened. */
    void notificationService
      .notify({
        userId: user._id,
        type: 'user.email-verified',
        title: 'Email verified',
        body: 'You can now sign in and use every part of OSK.',
        href: '/dashboard',
      })
      .catch((err) =>
        logger.warn({ err }, 'email-verified notification skipped'),
      );
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
    /* Clicking a reset link that landed in this inbox proves the user
     * controls the address — equivalent to clicking a verify link. So
     * we mark them verified here too. Otherwise a user who signed up,
     * forgot the password, and reset it would still be locked out of
     * login by the email-verification gate. */
    if (!user.emailVerified) {
      user.emailVerified = true;
      user.emailVerifyTokenHash = undefined;
    }
    await user.save();
    // Revoke every existing session — the password just changed.
    await authRepository.revokeAllForUser(user._id as Types.ObjectId);
  },

  /**
   * Public version of resendVerification — keyed by email, so an
   * unauthenticated user blocked at login by EMAIL_NOT_VERIFIED can
   * request a fresh link. Always resolves (no enumeration); the
   * controller rate-limits the endpoint.
   */
  async resendVerificationPublic(
    email: string,
    ctx: { origin?: string | null } = {},
  ): Promise<void> {
    const user = await authRepository.findUserByEmail(email);
    if (!user || user.emailVerified) return;
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
      'public email verification token issued',
    );
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

    /* Google-only users have no password yet — "change password"
     * becomes "set password" for them, skipping the currentPassword
     * compare. Treat an empty `currentPassword` from the form as
     * acceptable in that case; require it otherwise. */
    if (user.passwordHash) {
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedError('Current password is incorrect');
      }
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
  /**
   * Sign in (or register) a user via a verified Google identity.
   *
   * Resolution order:
   *  1. Existing user with this google identity → straight sign-in.
   *  2. Existing user with this email, IF Google says the email is
   *     verified → silently link the identity, then sign in. Without
   *     that `email_verified === true` check this is an
   *     account-takeover path, so we refuse to link otherwise and
   *     surface a clear error.
   *  3. Brand-new user → create with no password, emailVerified=true,
   *     identity attached.
   */
  async loginWithGoogle(
    profile: {
      sub: string;
      email: string;
      emailVerified: boolean;
      name?: string;
      picture?: string;
    },
    ctx: { origin?: string | null } = {},
  ): Promise<AuthIssue> {
    const normalizedEmail = profile.email.toLowerCase();

    /* 1. Already-linked Google account. */
    let user = await authRepository.findUserByIdentity('google', profile.sub);

    /* 2. Same email, but no Google identity yet. */
    if (!user) {
      const byEmail = await authRepository.findUserByEmail(normalizedEmail);
      if (byEmail) {
        if (!profile.emailVerified) {
          throw new ForbiddenError(
            'Google reports this email as unverified — sign in with your password instead, then link Google from your profile.',
          );
        }
        if (byEmail.status === 'blocked') {
          throw new ForbiddenError('This account has been suspended');
        }
        await authRepository.linkIdentity(
          byEmail._id as Types.ObjectId,
          'google',
          profile.sub,
        );
        /* If the local account was created via password and never
         * verified — Google's verification is good enough. */
        if (!byEmail.emailVerified) {
          byEmail.emailVerified = true;
        }
        /* Pick up the avatar if we don't have one yet. */
        if (!byEmail.avatarUrl && profile.picture) {
          byEmail.avatarUrl = profile.picture;
        }
        if (ctx.origin && byEmail.lastOrigin !== ctx.origin) {
          byEmail.lastOrigin = ctx.origin;
        }
        await byEmail.save();
        user = byEmail;
      }
    }

    /* 3. Brand-new user — Google handled email verification for us. */
    if (!user) {
      user = await authRepository.createUser({
        name: profile.name || normalizedEmail.split('@')[0] || normalizedEmail,
        email: normalizedEmail,
        role: 'buyer',
        emailVerified: true,
        avatarUrl: profile.picture,
        identities: [{ provider: 'google', providerUserId: profile.sub }],
        lastOrigin: ctx.origin ?? undefined,
      });
      void sendWelcomeEmail({
        to: user.email,
        name: user.name,
        requestOrigin: ctx.origin,
      });
      logger.info(
        { email: user.email, via: 'google' },
        'user registered via google',
      );
    } else if (user.status === 'blocked') {
      throw new ForbiddenError('This account has been suspended');
    } else if (ctx.origin && user.lastOrigin !== ctx.origin) {
      user.lastOrigin = ctx.origin;
      await user.save();
    }

    return issueTokens(user, newTokenFamily());
  },

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
