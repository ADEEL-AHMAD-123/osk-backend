import { z } from 'zod';
import { EMAIL_PROVIDER_KEYS } from './emailSettings.model';

const secretField = z.string().max(512).optional();

const resendPatch = z
  .object({
    apiKey: secretField,
  })
  .partial();

const smtpPatch = z
  .object({
    host: z.string().max(200).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    secure: z.boolean().optional(),
    user: z.string().max(200).optional(),
    password: secretField,
  })
  .partial();

/** PATCH /admin/email body. Every field optional — partial updates. */
export const updateEmailSettingsSchema = z.object({
  provider: z.enum(EMAIL_PROVIDER_KEYS).optional(),
  fromAddress: z
    .string()
    .email()
    .max(200)
    .optional()
    .or(z.literal('')),
  fromName: z.string().max(80).optional(),
  resend: resendPatch.optional(),
  smtp: smtpPatch.optional(),
});
export type UpdateEmailSettingsInput = z.infer<typeof updateEmailSettingsSchema>;

/** POST /admin/email/test body — admin can override the recipient. */
export const sendTestEmailSchema = z.object({
  to: z.string().email().max(200),
});
export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;
