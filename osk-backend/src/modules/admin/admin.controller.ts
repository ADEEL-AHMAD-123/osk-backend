import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors';
import { buildMeta, sendSuccess } from '../../shared/response';
import { UserModel } from '../auth/user.model';
import { InquiryModel } from '../inquiries/inquiry.model';
import { PropertyModel } from '../properties/property.model';
import { ReviewModel } from '../reviews/review.model';
import { propertyService } from '../properties/property.service';
import { propertyFiltersSchema } from '../properties/property.schema';
import { toUserDTO } from '../users/user.mapper';
import { auditService } from '../audit/audit.service';
import { authService } from '../auth/auth.service';

/* ──────────────────────────────────────────────────────────────────────
 * Admin module — read-only metrics + moderation actions.
 * Routes are mounted under /admin and authorize('admin') gates every one.
 * ────────────────────────────────────────────────────────────────────── */

/** GET /admin/overview — high-level counts for the admin dashboard. */
export const getOverview: RequestHandler = async (_req, res) => {
  const [
    userTotal,
    agentTotal,
    blockedTotal,
    propertyTotal,
    propertyPending,
    propertyPublished,
    inquiryTotal,
    reviewTotal,
  ] = await Promise.all([
    UserModel.countDocuments({}).exec(),
    UserModel.countDocuments({ role: 'agent' }).exec(),
    UserModel.countDocuments({ status: 'blocked' }).exec(),
    PropertyModel.countDocuments({}).exec(),
    PropertyModel.countDocuments({ status: 'pending-review' }).exec(),
    PropertyModel.countDocuments({ status: 'published' }).exec(),
    InquiryModel.countDocuments({}).exec(),
    ReviewModel.countDocuments({}).exec(),
  ]);

  sendSuccess(res, {
    users: { total: userTotal, agents: agentTotal, blocked: blockedTotal },
    properties: {
      total: propertyTotal,
      pending: propertyPending,
      published: propertyPublished,
    },
    inquiries: { total: inquiryTotal },
    reviews: { total: reviewTotal },
  });
};

/** GET /admin/properties/pending — listings awaiting moderation. */
export const listPendingProperties: RequestHandler = async (req, res) => {
  const filters = propertyFiltersSchema.parse({
    ...req.query,
    /* moderation queue is opinionated about sort. */
    sort: req.query.sort ?? 'createdAt',
  });
  /* listForOwner does an unfiltered list when no owner is set; we want all
   * pending-review properties across all owners, so go straight to the model. */
  const skip = (filters.page - 1) * filters.limit;
  const [items, total] = await Promise.all([
    PropertyModel.find({ status: 'pending-review' })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(filters.limit)
      .exec(),
    PropertyModel.countDocuments({ status: 'pending-review' }).exec(),
  ]);
  const { toPropertyDTO } = await import('../properties/property.mapper');
  sendSuccess(res, items.map(toPropertyDTO), {
    meta: buildMeta(filters.page, filters.limit, total),
  });
};

/* ─── user management ──────────────────────────────────────────────────── */

const userPatchSchema = z.object({
  role: z.enum(['buyer', 'seller', 'agent', 'admin']).optional(),
  status: z.enum(['active', 'blocked']).optional(),
});

/** PATCH /admin/users/:id — change role or status. */
export const updateUser: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const parsed = userPatchSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  /* Load the current doc so we can record what changed in the audit log. */
  const existing = await UserModel.findById(req.params.id).exec();
  if (!existing) throw new NotFoundError('User not found');

  const updates: Record<string, unknown> = {};
  if (parsed.data.role) updates.role = parsed.data.role;
  if (parsed.data.status) updates.status = parsed.data.status;

  const user = await UserModel.findByIdAndUpdate(req.params.id, updates, {
    new: true,
  }).exec();
  if (!user) throw new NotFoundError('User not found');

  if (parsed.data.role && parsed.data.role !== existing.role) {
    void auditService.record({
      actor: req.user,
      action: 'user.role.update',
      entityType: 'user',
      entityId: user._id.toString(),
      meta: { before: existing.role, after: user.role },
      req,
    });
  }
  if (parsed.data.status && parsed.data.status !== existing.status) {
    void auditService.record({
      actor: req.user,
      action: 'user.status.update',
      entityType: 'user',
      entityId: user._id.toString(),
      meta: { before: existing.status, after: user.status },
      req,
    });
  }

  sendSuccess(res, toUserDTO(user));
};

/* ─── review moderation ─────────────────────────────────────────────────── */

/** GET /admin/reviews — recent reviews, paged. */
export const listReviewsForModeration: RequestHandler = async (req, res) => {
  const schema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(60).default(20),
  });
  const { page, limit } = schema.parse(req.query);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ReviewModel.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('authorId', 'name email')
      .exec(),
    ReviewModel.countDocuments({}).exec(),
  ]);
  sendSuccess(
    res,
    items.map((r) => {
      const author = r.authorId as unknown as
        | { name?: string; email?: string }
        | null;
      return {
        id: r._id.toString(),
        propertyId: r.propertyId.toString(),
        rating: r.rating,
        title: r.title,
        body: r.body,
        status: r.status,
        authorName: author?.name ?? 'Unknown',
        authorEmail: author?.email ?? '',
        createdAt: r.createdAt.toISOString(),
      };
    }),
    { meta: buildMeta(page, limit, total) },
  );
};

/** DELETE /admin/reviews/:id — remove a review. */
export const deleteReview: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const review = await ReviewModel.findByIdAndDelete(req.params.id).exec();
  if (!review) throw new NotFoundError('Review not found');

  void auditService.record({
    actor: req.user,
    action: 'review.delete',
    entityType: 'review',
    entityId: review._id.toString(),
    meta: {
      propertyId: review.propertyId.toString(),
      rating: review.rating,
      authorId: review.authorId.toString(),
    },
    req,
  });

  sendSuccess(res, { id: review._id.toString(), deleted: true });
};

/* Property moderation under /admin — wraps the lifecycle service with
 * audit emission. The /properties/:id/{approve,reject} routes still work
 * for legacy callers but won't write to the audit log. */
export const approvePropertyAdmin: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const id = req.params.id ?? '';
  const property = await propertyService.review(id, 'approve');
  void auditService.record({
    actor: req.user,
    action: 'property.approve',
    entityType: 'property',
    entityId: property.id,
    meta: { title: property.title },
    req,
  });
  sendSuccess(res, property);
};

export const rejectPropertyAdmin: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const id = req.params.id ?? '';
  const property = await propertyService.review(id, 'reject');
  void auditService.record({
    actor: req.user,
    action: 'property.reject',
    entityType: 'property',
    entityId: property.id,
    meta: { title: property.title },
    req,
  });
  sendSuccess(res, property);
};

/**
 * PATCH /admin/properties/:id/featured — flip the isFeatured flag. Body
 * is `{ isFeatured: boolean }`. Audited so admins can see which listings
 * were promoted (and by whom). Available regardless of moderation status,
 * so admins can feature a published listing without re-running approval.
 */
export const setPropertyFeatured: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();

  const parsed = z
    .object({ isFeatured: z.boolean() })
    .safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const doc = await PropertyModel.findById(req.params.id).exec();
  if (!doc) throw new NotFoundError('Property not found');

  const before = doc.isFeatured;
  doc.isFeatured = parsed.data.isFeatured;
  await doc.save();

  if (before !== parsed.data.isFeatured) {
    void auditService.record({
      actor: req.user,
      action: parsed.data.isFeatured
        ? 'property.feature'
        : 'property.unfeature',
      entityType: 'property',
      entityId: doc._id.toString(),
      meta: { title: doc.title },
      req,
    });
  }

  const { toPropertyDTO } = await import('../properties/property.mapper');
  sendSuccess(res, toPropertyDTO(doc));
};

/**
 * POST /admin/users/:id/impersonate — mint an access token + session for
 * the target user. The admin's existing refresh cookie is left alone so
 * "exit impersonation" is just "stop sending the target's bearer". The
 * response includes `impersonatedBy` so the client knows to render the
 * "stop impersonating" banner. Audit-logged with both ids.
 */
export const impersonateUser: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const targetId = req.params.id ?? '';
  if (targetId === req.user.id) {
    throw new ValidationError([
      { path: 'id', message: 'You cannot impersonate yourself' },
    ]);
  }

  /* loginExisting throws Unauthorized / Forbidden for missing or blocked
   * targets — surface those as-is. */
  const issued = await authService.loginExisting(targetId);

  void auditService.record({
    actor: req.user,
    action: 'user.impersonate',
    entityType: 'user',
    entityId: targetId,
    meta: { adminId: req.user.id, adminEmail: req.user.email },
    req,
  });

  /* No cookie set — admin keeps their own refresh family. The client
   * holds the new bearer in memory only; "stop impersonating" is a pure
   * client-side reset back to the admin's stashed bearer. */
  sendSuccess(res, {
    ...issued.result,
    impersonatedBy: { id: req.user.id, email: req.user.email },
  });
};

/* ─── audit log feed ───────────────────────────────────────────────────── */

/** GET /admin/audit-logs — paginated activity stream. */
export const listAuditLogs: RequestHandler = async (req, res) => {
  const schema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(30),
  });
  const { page, limit } = schema.parse(req.query);
  const { items, total } = await auditService.list(page, limit);
  sendSuccess(res, items, { meta: buildMeta(page, limit, total) });
};
