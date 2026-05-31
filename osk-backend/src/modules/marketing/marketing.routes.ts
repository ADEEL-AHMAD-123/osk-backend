import { Router, type RequestHandler } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../shared/asyncHandler';
import { sendSuccess } from '../../shared/response';
import {
  ServiceUnavailableError,
  ValidationError,
} from '../../shared/errors';
import { NewsletterSubscriberModel } from './subscriber.model';

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

  /** Upsert by email — duplicates re-subscribe silently. */
  await NewsletterSubscriberModel.findOneAndUpdate(
    { email: parsed.data.email },
    {
      email: parsed.data.email,
      source: parsed.data.source,
      $unset: { unsubscribedAt: 1 },
    },
    { upsert: true, new: true },
  ).exec();

  sendSuccess(res, { subscribed: true });
};

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
