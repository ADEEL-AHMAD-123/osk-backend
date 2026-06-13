import { z } from 'zod';

export const inquirySchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().min(6).max(20).optional(),
  message: z.string().min(10).max(2000),
  captchaToken: z.string().min(1),
  consent: z.literal(true),
});
export type InquiryDto = z.infer<typeof inquirySchema>;

export const callbackSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(2).max(80),
  phone: z.string().min(6).max(20),
  slots: z.array(z.string()).min(1).max(3),
  captchaToken: z.string().min(1),
  consent: z.literal(true),
});
export type CallbackDto = z.infer<typeof callbackSchema>;

export const inquiryFiltersSchema = z.object({
  propertyId: z.string().optional(),
  channel: z.enum(['email', 'call', 'whatsapp', 'chat']).optional(),
  status: z
    .enum(['new', 'contacted', 'callback-requested', 'closed'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(24),
});
export type InquiryFilters = z.infer<typeof inquiryFiltersSchema>;

export const updateInquirySchema = z.object({
  status: z.enum(['new', 'contacted', 'callback-requested', 'closed']),
});
export type UpdateInquiryDto = z.infer<typeof updateInquirySchema>;
