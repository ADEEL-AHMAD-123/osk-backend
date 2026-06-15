import { z } from 'zod';
import { CONTACT_TOPICS } from './contactMessage.model';

/** Public submit schema for POST /contact/general. */
export const contactGeneralSchema = z.object({
  name: z.string().min(2, 'Please enter your full name.').max(80),
  email: z.string().email('Please enter a valid email.').max(200),
  topic: z.enum(CONTACT_TOPICS),
  message: z
    .string()
    .min(20, 'Tell us a little more — at least 20 characters.')
    .max(4000),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm consent to contact you.' }),
  }),
  /** Captcha token (or 'disabled' when captcha is off). */
  captchaToken: z.string().min(1).max(4000),
});

export type ContactGeneralInput = z.infer<typeof contactGeneralSchema>;

/** Admin status patch. */
export const contactMessagePatchSchema = z.object({
  status: z.enum(['new', 'replied', 'closed']).optional(),
  adminNote: z.string().max(2000).optional(),
});

export type ContactMessagePatchInput = z.infer<
  typeof contactMessagePatchSchema
>;

/** Inline reply payload — admin types the reply body in the dashboard. */
export const contactReplySchema = z.object({
  body: z.string().min(2, 'Reply is empty').max(10_000),
});
export type ContactReplyInput = z.infer<typeof contactReplySchema>;
