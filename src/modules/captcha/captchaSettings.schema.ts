import { z } from 'zod';
import { CAPTCHA_PROVIDER_KEYS } from './captchaSettings.model';

/** PATCH /admin/captcha body. Every field is optional — partial
 *  updates. Secret is sent raw and encrypted on the way in. */
export const updateCaptchaSettingsSchema = z.object({
  provider: z.enum(CAPTCHA_PROVIDER_KEYS).optional(),
  siteKey: z.string().max(200).optional(),
  secretKey: z.string().max(512).optional(),
});
export type UpdateCaptchaSettingsInput = z.infer<
  typeof updateCaptchaSettingsSchema
>;
