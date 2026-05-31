import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Express } from 'express';
import request, { type SuperAgentTest } from 'supertest';
import { createApp } from '../app';
import { UserModel, type UserRole } from '../modules/auth/user.model';

/**
 * Shared integration-test harness. Suites call `setupTestApp()` from
 * beforeAll, then use the returned helpers (request agent + user
 * factories + sign-in) to drive the real Express app against an
 * in-memory Mongo. Every collection is wiped between tests so suites
 * stay isolated.
 */

export interface TestContext {
  app: Express;
  agent: SuperAgentTest;
  mongo: MongoMemoryServer;
}

export async function setupTestApp(): Promise<TestContext> {
  /* Pin a version that has wide platform coverage. Override with
   * MONGOMS_VERSION in CI if a different image is needed. */
  const mongo = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? '7.0.14' },
  });
  await mongoose.connect(mongo.getUri());
  const app = createApp();
  const agent = request.agent(app) as unknown as SuperAgentTest;
  return { app, agent, mongo };
}

export async function teardownTestApp(
  ctx: TestContext | undefined,
): Promise<void> {
  /* Guard so a failed setup doesn't crash teardown — the suite already
   * surfaced the real cause. */
  if (!ctx) return;
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  await ctx.mongo.stop();
}

/** Wipe every collection — fast and avoids cross-test bleed. */
export async function resetDb(): Promise<void> {
  const collections = await mongoose.connection.db?.collections();
  if (!collections) return;
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

/* ──────────────────────────────────────────────────────────────────────
 * Auth helpers — register + sign-in shortcuts that return the access
 * token so authenticated requests are one line.
 * ────────────────────────────────────────────────────────────────────── */

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  role: UserRole;
}

let userCounter = 0;
function unique(prefix: string): string {
  userCounter += 1;
  return `${prefix}+${Date.now()}-${userCounter}@osk.test`;
}

export async function registerAndLogin(
  app: Express,
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    role: 'buyer' | 'seller' | 'agent';
  }> = {},
): Promise<TestUser> {
  const email = overrides.email ?? unique(overrides.role ?? 'user');
  const password = overrides.password ?? 'Password123';
  const name = overrides.name ?? 'Test User';
  const role = overrides.role ?? 'buyer';

  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name, email, password, role })
    .expect(200);

  return {
    id: res.body.data.user.id,
    email,
    password,
    accessToken: res.body.data.accessToken,
    role: res.body.data.user.role,
  };
}

/** Promote an existing user to admin (admin can't self-register). */
export async function makeAdmin(userId: string): Promise<void> {
  await UserModel.findByIdAndUpdate(userId, { role: 'admin' }).exec();
}

export async function createAdminUser(app: Express): Promise<TestUser> {
  const user = await registerAndLogin(app, { role: 'seller' });
  await makeAdmin(user.id);
  /* Re-login so the access-token payload reflects the admin role. */
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);
  return {
    ...user,
    role: 'admin',
    accessToken: res.body.data.accessToken,
  };
}
