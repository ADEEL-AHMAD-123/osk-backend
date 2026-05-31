import type { RequestHandler } from 'express';
import { ValidationError } from '../../shared/errors';
import { sendSuccess, buildMeta } from '../../shared/response';
import { inquiryService } from './inquiry.service';
import { toInquiryDTO } from './inquiry.mapper';
import {
  callbackSchema,
  inquiryFiltersSchema,
  inquirySchema,
  updateInquirySchema,
} from './inquiry.schema';

/* helpers ─────────────────────────────────────────────────────────────── */

function reqMeta(req: Parameters<RequestHandler>[0]): {
  ip?: string;
  userAgent?: string;
} {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

/* handlers ────────────────────────────────────────────────────────────── */

/** POST /inquiries — email channel (typically called via /contact/inquiry). */
export const createEmailInquiry: RequestHandler = async (req, res) => {
  const parsed = inquirySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues);
  }
  const inquiry = await inquiryService.createEmailInquiry(
    parsed.data,
    reqMeta(req),
  );
  sendSuccess(res, toInquiryDTO(inquiry), { status: 201 });
};

/** POST /inquiries/callback — call channel. */
export const createCallbackInquiry: RequestHandler = async (req, res) => {
  const parsed = callbackSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues);
  }
  const inquiry = await inquiryService.createCallbackRequest(
    parsed.data,
    reqMeta(req),
  );
  sendSuccess(res, toInquiryDTO(inquiry), { status: 201 });
};

/** GET /inquiries — owner / admin list. */
export const listInquiries: RequestHandler = async (req, res) => {
  const parsed = inquiryFiltersSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues);
  }
  const { items, total } = await inquiryService.list(parsed.data, req.user!);
  sendSuccess(
    res,
    items.map(toInquiryDTO),
    { meta: buildMeta(parsed.data.page, parsed.data.limit, total) },
  );
};

/** PATCH /inquiries/:id — owner / admin status update. */
export const updateInquiry: RequestHandler = async (req, res) => {
  const parsed = updateInquirySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues);
  }
  const inquiry = await inquiryService.updateStatus(
    req.params.id ?? '',
    parsed.data.status,
    req.user!,
  );
  sendSuccess(res, toInquiryDTO(inquiry));
};
