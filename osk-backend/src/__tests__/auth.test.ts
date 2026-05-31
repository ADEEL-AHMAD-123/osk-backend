import request from 'supertest';
import { UserModel } from '../modules/auth/user.model';
import {
  registerAndLogin,
  resetDb,
  setupTestApp,
  teardownTestApp,
  type TestContext,
} from './setup';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestApp();
});

afterAll(async () => {
  await teardownTestApp(ctx);
});

beforeEach(async () => {
  await resetDb();
});

describe('auth — registration & login', () => {
  it('registers a new buyer and returns a session + access token', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Ada Lovelace',
        email: 'ada@osk.test',
        password: 'Password123',
        role: 'buyer',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('ada@osk.test');
    expect(res.body.data.user.role).toBe('buyer');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.accessToken.length).toBeGreaterThan(20);
    /* Refresh token rides in an httpOnly cookie, not the JSON body. */
    expect(res.body.data.refreshToken).toBeUndefined();
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
  });

  it('rejects a weak password with a validation error', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bad Pass',
        email: 'weak@osk.test',
        password: 'short',
      })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate email with 409', async () => {
    await registerAndLogin(ctx.app, { email: 'dup@osk.test' });
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Dup',
        email: 'dup@osk.test',
        password: 'Password123',
      })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('logs in with valid credentials', async () => {
    const user = await registerAndLogin(ctx.app, { email: 'login@osk.test' });
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(res.body.data.user.email).toBe('login@osk.test');
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('returns the same generic error for unknown email and wrong password', async () => {
    await registerAndLogin(ctx.app, { email: 'real@osk.test' });

    const wrongPw = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'real@osk.test', password: 'WrongPass1' })
      .expect(401);

    const unknown = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@osk.test', password: 'Password123' })
      .expect(401);

    /* User enumeration protection: identical error message either way. */
    expect(wrongPw.body.error.message).toBe(unknown.body.error.message);
  });

  it('blocks login for a suspended account', async () => {
    const user = await registerAndLogin(ctx.app, { email: 'blocked@osk.test' });
    await UserModel.findByIdAndUpdate(user.id, { status: 'blocked' }).exec();
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('auth — session & token rotation', () => {
  it('returns the current user from /session with a valid access token', async () => {
    const user = await registerAndLogin(ctx.app);
    const res = await request(ctx.app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(res.body.data.email).toBe(user.email);
  });

  it('rejects /session without a token', async () => {
    await request(ctx.app).get('/api/v1/auth/session').expect(401);
  });

  it('rotates the refresh token and reuse-detects a stale one', async () => {
    /* Step 1 — register, capture the refresh cookie. */
    const reg = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Rotate User',
        email: 'rotate@osk.test',
        password: 'Password123',
      })
      .expect(200);
    const firstCookie = (reg.headers['set-cookie'] as unknown as string[])[0]!;

    /* Step 2 — use the cookie to refresh; should succeed and return a new
     * access token + a new refresh cookie. */
    const refresh1 = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    expect(refresh1.body.data.accessToken).toBeTruthy();
    const secondCookie = (refresh1.headers['set-cookie'] as unknown as string[])[0]!;
    expect(secondCookie).not.toEqual(firstCookie);

    /* Step 3 — present the ORIGINAL (already-used) refresh cookie. The
     * server must detect reuse, burn the whole family, and 401. */
    const reuse = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);
    expect(reuse.body.error.code).toBe('UNAUTHORIZED');

    /* Step 4 — even the second (legit) refresh is now dead because the
     * family was revoked when reuse was detected. */
    await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });
});

describe('auth — password reset & verify-email', () => {
  it('forgot-password always returns 200, even for unknown emails', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@osk.test' })
      .expect(200);
  });

  it('reset-password rejects an invalid token', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'bogus', password: 'NewPass123' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('verify-email rejects an invalid token', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'bogus' })
      .expect(401);
  });
});
