import mongoose, { type Types } from 'mongoose';
import { ServiceUnavailableError } from '../../shared/errors';
import { UserModel, type UserDoc, type UserRole } from './user.model';
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
  passwordHash: string;
  role: UserRole;
  emailVerifyTokenHash: string;
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
    return UserModel.create(data);
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
