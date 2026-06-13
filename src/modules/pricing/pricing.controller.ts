import type { RequestHandler } from 'express';
import { ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import { updateSettingsSchema } from './pricing.schema';
import { pricingService } from './pricing.service';

/* ─── Settings (admin write / public read) ────────────────────────── */

export const getSettings: RequestHandler = async (_req, res) => {
  sendSuccess(res, await pricingService.getSettings());
};

export const updateSettings: RequestHandler = async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(res, await pricingService.updateSettings(parsed.data));
};
