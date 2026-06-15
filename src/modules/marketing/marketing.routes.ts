import { Router, type RequestHandler } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate, authorize } from '../../shared/middleware/auth';
import { buildMeta, sendSuccess } from '../../shared/response';
import {
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../../shared/errors';
import { logger } from '../../config/logger';
import { getBrandingContext } from '../../shared/email/brandingContext';
import { getEmailProvider } from '../../shared/email/EmailProvider';
import { renderEmailTemplate } from '../../shared/email/emailTemplates';
import { resolveAppBaseUrl } from '../../shared/email/appBaseUrl';
import { emailSettingsService } from '../email/emailSettings.service';
import { NewsletterSubscriberModel } from './subscriber.model';

/* ─────────────────────────────────────────────────────────────────
 * Newsletter subscribe + admin management.
 *
 * Public:
 *   POST /marketing/subscribe            upsert by email; fires welcome
 *
 * Admin:
 *   GET   /admin/subscribers             paginated list, status filter
 *   GET   /admin/subscribers/export.csv  full export, no pagination
 *   DELETE /admin/subscribers/:id        soft-unsubscribe
 * ──────────────────────────────────────────────────────────────── */

const subscribeSchema = z.object({
  email: z.string().email(),
  source: z.string().max(120).optional(),
});

const subscribe: RequestHandler = async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    throw new ServiceUnavailableError(
      'Database unavailable — start MongoDB and try again',
    );
  }
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  /* Upsert by email — duplicates re-subscribe silently. */
  const doc = await NewsletterSubscriberModel.findOneAndUpdate(
    { email: parsed.data.email },
    {
      email: parsed.data.email,
      source: parsed.data.source,
      $unset: { unsubscribedAt: 1 },
    },
    { upsert: true, new: true },
  ).exec();

  /* Welcome email — fire-and-forget. A delivery blip must NOT fail
   * the subscribe call, otherwise rate-limit-burning retries follow.
   * Uses the same branded template the rest of the app does. */
  void (async () => {
    try {
      const [branding, emailSettings] = await Promise.all([
        getBrandingContext(),
        emailSettingsService.getProviderSecrets(),
      ]);
      const provider = await getEmailProvider();
      const appUrl = resolveAppBaseUrl({ requestOrigin: req.headers.origin ?? null });
      const html = `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
          Welcome — thanks for subscribing to <strong>${escapeHtml(
            branding.appName,
          )}</strong>. Expect one email each Friday with the freshest listings,
          short market notes, and a hand-picked home of the week.
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#555;">
          You can unsubscribe at any time — every email includes a link.
        </p>`;
      const { html: rendered, text } = renderEmailTemplate(
        emailSettings.activeTemplate,
        {
          title: `Welcome to ${branding.appName}`,
          body: html,
          buttonHref: appUrl,
          buttonLabel: 'Browse listings',
        },
        branding,
      );
      await provider.send({
        to: doc.email,
        subject: `Welcome to ${branding.appName}`,
        html: rendered,
        text,
      });
    } catch (err) {
      logger.warn({ err, email: doc.email }, 'newsletter welcome email skipped');
    }
  })();

  sendSuccess(res, { subscribed: true });
};

/* ─── Admin handlers ─────────────────────────────────────────────── */

const adminListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  q: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'unsubscribed', 'all']).default('active'),
});

const listSubscribers: RequestHandler = async (req, res) => {
  const { page, limit, q, status } = adminListSchema.parse(req.query);
  const query: Record<string, unknown> = {};
  if (status === 'active') query.unsubscribedAt = { $exists: false };
  if (status === 'unsubscribed') query.unsubscribedAt = { $exists: true };
  if (q) {
    query.email = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }
  const skip = (page - 1) * limit;
  const [items, total, active] = await Promise.all([
    NewsletterSubscriberModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    NewsletterSubscriberModel.countDocuments(query).exec(),
    NewsletterSubscriberModel.countDocuments({
      unsubscribedAt: { $exists: false },
    }).exec(),
  ]);
  sendSuccess(
    res,
    {
      items: items.map((d) => ({
        id: d._id.toString(),
        email: d.email,
        source: d.source ?? '',
        unsubscribedAt: d.unsubscribedAt ? d.unsubscribedAt.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
      })),
      activeTotal: active,
    },
    { meta: buildMeta(page, limit, total) },
  );
};

const exportCsv: RequestHandler = async (_req, res) => {
  /* Stream-safe even on big lists because we map to strings as we go.
   * 200k rows is comfortable for an in-memory pull; if subscriber
   * count crosses that, swap to a `.cursor()` stream. */
  const docs = await NewsletterSubscriberModel.find({})
    .sort({ createdAt: -1 })
    .exec();
  const header = ['email', 'source', 'status', 'subscribed_at', 'unsubscribed_at'];
  const rows = docs.map((d) =>
    [
      csvCell(d.email),
      csvCell(d.source ?? ''),
      d.unsubscribedAt ? 'unsubscribed' : 'active',
      d.createdAt.toISOString(),
      d.unsubscribedAt ? d.unsubscribedAt.toISOString() : '',
    ].join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
};

const unsubscribeSubscriber: RequestHandler = async (req, res) => {
  const id = req.params.id ?? '';
  if (!mongoose.isValidObjectId(id)) {
    throw new NotFoundError('Subscriber not found');
  }
  const doc = await NewsletterSubscriberModel.findByIdAndUpdate(
    id,
    { $set: { unsubscribedAt: new Date() } },
    { new: true },
  ).exec();
  if (!doc) throw new NotFoundError('Subscriber not found');
  sendSuccess(res, { unsubscribed: true });
};

/** RFC 4180 cell — quote, double internal quotes, wrap if needed. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─── routes ─────────────────────────────────────────────────────── */

export const marketingRoutes = Router();

const limiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests' },
  },
});

marketingRoutes.post('/subscribe', limiter, asyncHandler(subscribe));

export const marketingAdminRoutes = Router();
/* Explicit middleware per-route rather than `router.use(authenticate,
 * authorize('admin'))` — the per-route form matches the pattern used
 * elsewhere in the admin module and avoids any Router.use ordering
 * surprises that have bitten us before. */
marketingAdminRoutes.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(listSubscribers),
);
marketingAdminRoutes.get(
  '/export.csv',
  authenticate,
  authorize('admin'),
  asyncHandler(exportCsv),
);
marketingAdminRoutes.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(unsubscribeSubscriber),
);
