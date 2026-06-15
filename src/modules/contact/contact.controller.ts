import type { RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../shared/response';
import { ForbiddenError, ValidationError } from '../../shared/errors';
import { logger } from '../../config/logger';
import { preferredFrontendOrigin } from '../../shared/cors/originPolicy';
import { propertyService } from '../properties/property.service';
import { inquiryService } from '../inquiries/inquiry.service';
import { toInquiryDTO } from '../inquiries/inquiry.mapper';
import { captchaService } from '../captcha/captcha.service';
import {
  callbackSchema,
  inquirySchema,
} from '../inquiries/inquiry.schema';
import {
  contactGeneralSchema,
  contactMessagePatchSchema,
} from './contactMessage.schema';
import { contactMessageService } from './contactMessage.service';
import { buildMeta } from '../../shared/response';
import { NotFoundError } from '../../shared/errors';

function clientIp(req: import('express').Request): string | null {
  const fwd = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim();
  return fwd || req.ip || null;
}

async function assertCaptcha(
  token: string,
  req: import('express').Request,
): Promise<void> {
  const ok = await captchaService.verifyToken(token, clientIp(req));
  if (!ok) {
    throw new ForbiddenError(
      'We couldn’t verify the captcha. Please refresh the challenge and try again.',
    );
  }
}

/**
 * Contact-channels module — call / WhatsApp / email.
 *
 * Email and callback submissions are now persisted via the inquiries
 * module. `/call-intent` remains an analytics-only event (no DB write).
 * See ../../../docs/ARCHITECTURE.md §8.
 */

const callIntentSchema = z.object({
  propertyId: z.string().min(1),
  source: z.enum(['listing-card', 'detail-page']),
});

function primaryAppOrigin(): string {
  /* `CORS_ORIGIN` is now informational only — its first entry doubles
   * as "the canonical frontend origin for outbound links". The CORS
   * middleware itself reflects any browser origin (see originPolicy). */
  return preferredFrontendOrigin();
}

/** POST /contact/inquiry — email channel (secure relay, persisted). */
export const submitInquiry: RequestHandler = async (req, res) => {
  const parsed = inquirySchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  await assertCaptcha(parsed.data.captchaToken, req);

  const inquiry = await inquiryService.createEmailInquiry(parsed.data, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  sendSuccess(res, toInquiryDTO(inquiry), { status: 201 });
};

/** POST /contact/call-intent — analytics event for click-to-call. */
export const logCallIntent: RequestHandler = (req, res) => {
  const parsed = callIntentSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  logger.info(
    {
      propertyId: parsed.data.propertyId,
      source: parsed.data.source,
      channel: 'call',
    },
    'call intent',
  );
  sendSuccess(res, { logged: true });
};

/** POST /contact/callback-request — call channel, time-slot callback (persisted). */
export const requestCallback: RequestHandler = async (req, res) => {
  const parsed = callbackSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  await assertCaptcha(parsed.data.captchaToken, req);

  const inquiry = await inquiryService.createCallbackRequest(parsed.data, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  sendSuccess(res, toInquiryDTO(inquiry), { status: 201 });
};

/* ─────────────────────────────────────────────────────────────────
 * General contact form — public submit + admin moderation.
 * ──────────────────────────────────────────────────────────────── */

/** POST /contact/general — public contact form. Validates, runs the
 *  captcha gate, persists, fans out to admins (in-app + email). */
export const submitContactGeneral: RequestHandler = async (req, res) => {
  const parsed = contactGeneralSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  await assertCaptcha(parsed.data.captchaToken, req);

  const msg = await contactMessageService.create(
    {
      name: parsed.data.name,
      email: parsed.data.email,
      topic: parsed.data.topic,
      message: parsed.data.message,
    },
    {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin ?? null,
    },
  );
  sendSuccess(res, { id: msg._id.toString(), received: true }, { status: 201 });
};

const adminContactListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(20),
  status: z.enum(['new', 'replied', 'closed']).optional(),
});

/** GET /admin/contact-messages — paginated list with optional status. */
export const listContactMessages: RequestHandler = async (req, res) => {
  const { page, limit, status } = adminContactListSchema.parse(req.query);
  const result = await contactMessageService.list({ page, limit, status });
  sendSuccess(res, { items: result.items, unread: result.unread }, {
    meta: buildMeta(page, limit, result.total),
  });
};

/** PATCH /admin/contact-messages/:id — mark status + save admin note. */
export const updateContactMessage: RequestHandler = async (req, res) => {
  const parsed = contactMessagePatchSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const updated = await contactMessageService.update(
    req.params.id ?? '',
    parsed.data,
  );
  if (!updated) throw new NotFoundError('Contact message not found');
  sendSuccess(res, updated);
};

/** GET /contact/whatsapp-link/:propertyId — wa.me deep link with template. */
export const getWhatsAppLink: RequestHandler = async (req, res) => {
  const property = await propertyService.getById(req.params.propertyId ?? '');

  if (!property.contactCapabilities.whatsapp) {
    sendSuccess(res, { href: null, enabled: false });
    return;
  }

  // Owner WhatsApp number comes from contactPreferences in production.
  const ownerNumber = '15550000000';
  const listingUrl = `${primaryAppOrigin()}/property/${property.slug}`;
  const template =
    `Hi, I'm interested in "${property.title}" ` +
    `(${property.currency} ${property.price.toLocaleString('en-US')}). ` +
    `Listing: ${listingUrl}`;
  const href = `https://wa.me/${ownerNumber}?text=${encodeURIComponent(template)}`;

  sendSuccess(res, { href, enabled: true });
};
