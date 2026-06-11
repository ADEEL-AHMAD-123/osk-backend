import type { RequestHandler } from 'express';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { buildMeta, sendSuccess } from '../../shared/response';
import {
  createPropertySchema,
  propertyFiltersSchema,
  updatePropertySchema,
} from './property.schema';
import { propertyService } from './property.service';

/** GET /properties — public filtered, sorted, paginated listing. */
export const listProperties: RequestHandler = async (req, res) => {
  const filters = propertyFiltersSchema.parse(req.query);
  const page = await propertyService.list(filters);
  sendSuccess(res, page.items, {
    meta: buildMeta(page.page, page.limit, page.total),
  });
};

/** GET /properties/map?bbox=west,south,east,north — viewport search. */
export const listPropertiesInViewport: RequestHandler = async (req, res) => {
  const parts = String(req.query.bbox ?? '')
    .split(',')
    .map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new ValidationError([
      { path: 'bbox', message: 'Expected bbox=west,south,east,north' },
    ]);
  }
  const bbox = parts as [number, number, number, number];
  sendSuccess(res, await propertyService.inViewport(bbox));
};

/** GET /properties/mine — the authenticated owner's listings (any status). */
export const listMyProperties: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const filters = propertyFiltersSchema.parse(req.query);
  const page = await propertyService.listForOwner(req.user.id, filters);
  sendSuccess(res, page.items, {
    meta: buildMeta(page.page, page.limit, page.total),
  });
};

/** GET /properties/:slug — public property detail. */
export const getProperty: RequestHandler = async (req, res) => {
  sendSuccess(res, await propertyService.getBySlug(req.params.slug ?? ''));
};

/** POST /properties — create a draft listing. */
export const createProperty: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const input = createPropertySchema.parse(req.body);
  const property = await propertyService.create(req.user.id, input);
  sendSuccess(res, property, { status: 201 });
};

/** PATCH /properties/:id — update an owned listing. */
export const updateProperty: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const input = updatePropertySchema.parse(req.body);
  const property = await propertyService.update(
    req.params.id ?? '',
    req.user,
    input,
  );
  sendSuccess(res, property);
};

/** POST /properties/:id/submit — send a draft into the moderation queue. */
export const submitProperty: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  sendSuccess(
    res,
    await propertyService.submitForReview(req.params.id ?? '', req.user),
  );
};

/** POST /properties/:id/mark-sold — owner closes the deal. */
export const markPropertySold: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  sendSuccess(
    res,
    await propertyService.markSold(req.params.id ?? '', req.user),
  );
};

/** POST /properties/:id/reopen — owner re-lists a sold property. */
export const reopenProperty: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  sendSuccess(
    res,
    await propertyService.reopen(req.params.id ?? '', req.user),
  );
};

/** POST /properties/:id/approve — admin moderation. */
export const approveProperty: RequestHandler = async (req, res) => {
  sendSuccess(res, await propertyService.review(req.params.id ?? '', 'approve'));
};

/** POST /properties/:id/reject — admin moderation. Body: `{ reason }`. */
export const rejectProperty: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as { reason?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason : '';
  sendSuccess(
    res,
    await propertyService.review(req.params.id ?? '', 'reject', { reason }),
  );
};

/**
 * POST /properties/:id/view — bump the listing view counter. Rate-limited
 * at the route layer; the client also debounces per-tab.
 */
export const recordPropertyView: RequestHandler = async (req, res) => {
  await propertyService.recordView(req.params.id ?? '');
  sendSuccess(res, { recorded: true });
};

/** GET /properties/me/analytics — per-listing view + inquiry counts. */
export const getMyAnalytics: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  sendSuccess(res, await propertyService.ownerAnalytics(req.user.id));
};
