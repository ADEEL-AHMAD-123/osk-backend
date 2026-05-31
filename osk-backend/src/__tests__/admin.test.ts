import request from 'supertest';
import { AuditLogModel } from '../modules/audit/audit.model';
import { PropertyModel } from '../modules/properties/property.model';
import { ReviewModel } from '../modules/reviews/review.model';
import { SAMPLE_PROPERTIES } from '../modules/properties/property.data';
import { Types } from 'mongoose';
import {
  createAdminUser,
  registerAndLogin,
  resetDb,
  setupTestApp,
  teardownTestApp,
  type TestContext,
  type TestUser,
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

/* Seed a tiny published-properties dataset owned by `ownerId`. */
async function seedProperties(ownerId: string, count = 3): Promise<void> {
  await PropertyModel.create(
    SAMPLE_PROPERTIES.slice(0, count).map((p) => ({
      ...p,
      owner: ownerId,
      status: 'published' as const,
    })),
  );
}

describe('admin — authorization', () => {
  it('forbids non-admins from hitting /admin/overview', async () => {
    const buyer = await registerAndLogin(ctx.app);
    await request(ctx.app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .expect(403);
  });

  it('rejects an unauthenticated request', async () => {
    await request(ctx.app).get('/api/v1/admin/overview').expect(401);
  });

  it('allows admins through /admin/overview', async () => {
    const admin = await createAdminUser(ctx.app);
    await seedProperties(admin.id);
    const res = await request(ctx.app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(res.body.data.users.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.properties.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.properties.published).toBeGreaterThanOrEqual(1);
  });
});

describe('admin — moderation flow', () => {
  let admin: TestUser;
  let seller: TestUser;
  let pendingId: string;

  beforeEach(async () => {
    admin = await createAdminUser(ctx.app);
    seller = await registerAndLogin(ctx.app, { role: 'seller' });
    /* Insert a pending-review property owned by the seller. */
    const doc = await PropertyModel.create({
      ...SAMPLE_PROPERTIES[0],
      owner: seller.id,
      status: 'pending-review',
      slug: `pending-${Date.now()}`,
    });
    pendingId = doc._id.toString();
  });

  it('lists pending properties in the moderation queue', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/admin/properties/pending')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((p: { id: string }) => p.id === pendingId)).toBe(
      true,
    );
  });

  it('approve flips status to published and writes an audit entry', async () => {
    await request(ctx.app)
      .post(`/api/v1/admin/properties/${pendingId}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const after = await PropertyModel.findById(pendingId).lean().exec();
    expect(after?.status).toBe('published');

    const audit = await AuditLogModel.findOne({
      action: 'property.approve',
      entityId: pendingId,
    }).lean().exec();
    expect(audit).not.toBeNull();
    expect(audit?.actorId.toString()).toBe(admin.id);
  });

  it('reject flips status to rejected and writes an audit entry', async () => {
    await request(ctx.app)
      .post(`/api/v1/admin/properties/${pendingId}/reject`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const after = await PropertyModel.findById(pendingId).lean().exec();
    expect(after?.status).toBe('rejected');

    const audit = await AuditLogModel.findOne({
      action: 'property.reject',
      entityId: pendingId,
    }).lean().exec();
    expect(audit).not.toBeNull();
  });

  it('refuses to approve a non-pending listing', async () => {
    const drafted = await PropertyModel.create({
      ...SAMPLE_PROPERTIES[0],
      owner: seller.id,
      status: 'draft',
      slug: `draft-${Date.now()}`,
    });
    await request(ctx.app)
      .post(`/api/v1/admin/properties/${drafted._id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(409);
  });
});

describe('admin — user management', () => {
  it('promotes a user to agent and audits the change', async () => {
    const admin = await createAdminUser(ctx.app);
    const target = await registerAndLogin(ctx.app, { email: 'patch@osk.test' });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'agent' })
      .expect(200);
    expect(res.body.data.role).toBe('agent');

    const audit = await AuditLogModel.findOne({
      action: 'user.role.update',
      entityId: target.id,
    }).lean().exec();
    expect(audit?.meta?.before).toBe('buyer');
    expect(audit?.meta?.after).toBe('agent');
  });

  it('blocks a user, audits it, then unblocks again', async () => {
    const admin = await createAdminUser(ctx.app);
    const target = await registerAndLogin(ctx.app, { email: 'block@osk.test' });

    await request(ctx.app)
      .patch(`/api/v1/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'blocked' })
      .expect(200);

    const blockAudit = await AuditLogModel.findOne({
      action: 'user.status.update',
      entityId: target.id,
    }).lean().exec();
    expect(blockAudit?.meta?.after).toBe('blocked');

    await request(ctx.app)
      .patch(`/api/v1/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'active' })
      .expect(200);

    /* Two distinct audit entries for the two status flips. */
    const count = await AuditLogModel.countDocuments({
      action: 'user.status.update',
      entityId: target.id,
    }).exec();
    expect(count).toBe(2);
  });

  it('returns 404 when patching an unknown user', async () => {
    const admin = await createAdminUser(ctx.app);
    await request(ctx.app)
      .patch(`/api/v1/admin/users/${new Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'agent' })
      .expect(404);
  });
});

describe('admin — reviews & audit feed', () => {
  it('deletes a review and writes an audit entry', async () => {
    const admin = await createAdminUser(ctx.app);
    const seller = await registerAndLogin(ctx.app, { role: 'seller' });
    const prop = await PropertyModel.create({
      ...SAMPLE_PROPERTIES[0],
      owner: seller.id,
      status: 'published',
      slug: `with-review-${Date.now()}`,
    });
    const review = await ReviewModel.create({
      propertyId: prop._id,
      authorId: seller.id,
      rating: 5,
      title: 'Great',
      body: 'Really enjoyed it.',
    });

    await request(ctx.app)
      .delete(`/api/v1/admin/reviews/${review._id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(await ReviewModel.findById(review._id).lean().exec()).toBeNull();
    const audit = await AuditLogModel.findOne({
      action: 'review.delete',
      entityId: review._id.toString(),
    }).lean().exec();
    expect(audit).not.toBeNull();
  });

  it('audit-logs feed returns recent activity newest-first', async () => {
    const admin = await createAdminUser(ctx.app);
    const target = await registerAndLogin(ctx.app);

    /* Generate two audit events. */
    await request(ctx.app)
      .patch(`/api/v1/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'agent' })
      .expect(200);
    await request(ctx.app)
      .patch(`/api/v1/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'blocked' })
      .expect(200);

    const res = await request(ctx.app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    /* Newest first. */
    const [first, second] = res.body.data;
    expect(new Date(first.createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(second.createdAt).getTime(),
    );
  });
});
