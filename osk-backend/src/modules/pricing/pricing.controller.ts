import type { RequestHandler } from 'express';
import { ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import {
  createPlanSchema,
  resolveSchema,
  updatePlanSchema,
  updateSettingsSchema,
} from './pricing.schema';
import { pricingService } from './pricing.service';

/* ─── Plans (admin) ───────────────────────────────────────────────── */

export const listPlans: RequestHandler = async (_req, res) => {
  sendSuccess(res, await pricingService.listPlans());
};

export const createPlan: RequestHandler = async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(res, await pricingService.createPlan(parsed.data), { status: 201 });
};

export const updatePlan: RequestHandler = async (req, res) => {
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(
    res,
    await pricingService.updatePlan(req.params.id!, parsed.data),
  );
};

export const deletePlan: RequestHandler = async (req, res) => {
  await pricingService.deletePlan(req.params.id!);
  sendSuccess(res, { id: req.params.id });
};

/* ─── Settings (admin write / public read) ────────────────────────── */

export const getSettings: RequestHandler = async (_req, res) => {
  sendSuccess(res, await pricingService.getSettings());
};

export const updateSettings: RequestHandler = async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(res, await pricingService.updateSettings(parsed.data));
};

/* ─── Resolver (authed seller) ────────────────────────────────────── */

export const resolvePrice: RequestHandler = async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(res, await pricingService.resolve(parsed.data));
};
