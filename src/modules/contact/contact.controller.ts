import type { RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../shared/response';
import { ValidationError } from '../../shared/errors';
import { logger } from '../../config/logger';
import { preferredFrontendOrigin } from '../../shared/cors/originPolicy';
import { propertyService } from '../properties/property.service';
import { inquiryService } from '../inquiries/inquiry.service';
import { toInquiryDTO } from '../inquiries/inquiry.mapper';
import {
  callbackSchema,
  inquirySchema,
} from '../inquiries/inquiry.schema';

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

  const inquiry = await inquiryService.createCallbackRequest(parsed.data, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  sendSuccess(res, toInquiryDTO(inquiry), { status: 201 });
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
