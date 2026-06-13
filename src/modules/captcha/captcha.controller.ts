import type { RequestHandler } from 'express';
import { ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import { captchaService } from './captcha.service';
import { updateCaptchaSettingsSchema } from './captchaSettings.schema';

/** GET /captcha/config — public, no auth. Frontend uses this to
 *  decide whether to mount the captcha widget. */
export const getPublicConfig: RequestHandler = async (_req, res) => {
  sendSuccess(res, await captchaService.getPublicConfig());
};

/** GET /admin/captcha — masked admin view. */
export const getCaptchaSettings: RequestHandler = async (_req, res) => {
  sendSuccess(res, await captchaService.getSettings());
};

/** PATCH /admin/captcha — provider + keys. */
export const updateCaptchaSettings: RequestHandler = async (req, res) => {
  const parsed = updateCaptchaSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(res, await captchaService.updateSettings(parsed.data));
};
