import mongoose, { type Types } from 'mongoose';
import { ServiceUnavailableError } from '../../shared/errors';
import {
  UserModel,
  type IdentityProvider,
  type UserDoc,
  type UserRole,
} from './user.model';
import { RefreshTokenModel, type RefreshTokenDoc } from './refreshToken.model';

/** Auth infrastructure layer — all User / RefreshToken persistence. */

function assertDbReady(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new ServiceUnavailableError(
      'Database unavailable — start MongoDB and try again',
    );
  }
}

export interface CreateUserData {
  name: string;
  email: string;
  /** Optional — Google-only users sign up without one. */
  passwordHash?: string;
  role: UserRole;
  /** Optional — Google-verified emails skip the verify-link flow,
   *  so no token is issued. */
  emailVerifyTokenHash?: string;
  emailVerified?: boolean;
  avatarUrl?: string;
  /** Identities to link at creation time (Google's `sub` etc.). */
  identities?: {
    provider: IdentityProvider;
    providerUserId: string;
  }[];
  /** Browser Origin of the registration request, used later as the
   *  fallback base URL for background-flow emails. */
  lastOrigin?: string;
}

export interface SaveRefreshData {
  user: Types.ObjectId;
  tokenHash: string;
  family: string;
  expiresAt: Date;
}

export const authRepository = {
  async findUserByEmail(
    email: string,
    withSecret = false,
  ): Promise<UserDoc | null> {
    assertDbReady();
    const query = UserModel.findOne({ email: email.toLowerCase() });
    if (withSecret) query.select('+passwordHash');
    return query.exec();
  },

  async findUserById(id: string): Promise<UserDoc | null> {
    assertDbReady();
    return UserModel.findById(id).exec();
  },

  /** Same as findUserById, but loads the `passwordHash` for password ops. */
  async findUserByIdWithPassword(id: string): Promise<UserDoc | null> {
    assertDbReady();
    return UserModel.findById(id).select('+passwordHash').exec();
  },

  async emailTaken(email: string): Promise<boolean> {
    assertDbReady();
    return (await UserModel.exists({ email: email.toLowerCase() })) !== null;
  },

  async createUser(data: CreateUserData): Promise<UserDoc> {
    assertDbReady();
    return UserModel.create({
      ...data,
      identities: (data.identities ?? []).map((i) => ({
        provider: i.provider,
        providerUserId: i.providerUserId,
        linkedAt: new Date(),
      })),
    });
  },

  /** Find a user by their federated identity (provider + providerUserId). */
  async findUserByIdentity(
    provider: IdentityProvider,
    providerUserId: string,
  ): Promise<UserDoc | null> {
    assertDbReady();
    return UserModel.findOne({
      identities: { $elemMatch: { provider, providerUserId } },
    }).exec();
  },

  /** Append an identity to an existing user (idempotent — skips if already linked). */
  async linkIdentity(
    userId: Types.ObjectId,
    provider: IdentityProvider,
    providerUserId: string,
  ): Promise<void> {
    assertDbReady();
    await UserModel.updateOne(
      {
        _id: userId,
        'identities.provider': { $ne: provider },
      },
      {
        $push: {
          identities: {
            provider,
            providerUserId,
            linkedAt: new Date(),
          },
        },
      },
    );
  },

  async findUserByVerifyHash(hash: string): Promise<UserDoc | null> {
    assertDbReady();
    return UserModel.findOne({ emailVerifyTokenHash: hash })
      .select('+emailVerifyTokenHash')
      .exec();
  },

  async findUserByResetHash(hash: string): Promise<UserDoc | null> {
    assertDbReady();
    return UserModel.findOne({
      passwordResetTokenHash: hash,
      passwordResetExpires: { $gt: new Date() },
    })
      .select('+passwordResetTokenHash +passwordResetExpires')
      .exec();
  },

  async saveRefreshToken(data: SaveRefreshData): Promise<RefreshTokenDoc> {
    assertDbReady();
    return RefreshTokenModel.create(data);
  },

  async findRefreshByHash(hash: string): Promise<RefreshTokenDoc | null> {
    assertDbReady();
    return RefreshTokenModel.findOne({ tokenHash: hash }).exec();
  },

  async markRefreshUsed(id: Types.ObjectId): Promise<void> {
    assertDbReady();
    await RefreshTokenModel.updateOne({ _id: id }, { used: true });
  },

  /** Revoke an entire rotation chain (used on logout + reuse detection). */
  async revokeFamily(family: string): Promise<void> {
    assertDbReady();
    await RefreshTokenModel.deleteMany({ family });
  },

  async revokeAllForUser(userId: Types.ObjectId): Promise<void> {
    assertDbReady();
    await RefreshTokenModel.deleteMany({ user: userId });
  },
};
