import type { RequestHandler } from 'express';
import { NotFoundError, ValidationError } from '../../shared/errors';
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

/** GET /captcha/challenge — public, no auth. Local-provider only;
 *  returns a fresh signed token + an SVG to render. 404s when the
 *  current provider is anything else so the frontend doesn't ask
 *  for a challenge it can't use. */
export const getChallenge: RequestHandler = async (_req, res) => {
  const challenge = await captchaService.getChallenge();
  if (!challenge) {
    throw new NotFoundError(
      'Local captcha is not enabled. Configure it from the admin panel.',
    );
  }
  /* Per-request — never cache. The challenge is single-use. */
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, challenge);
};
