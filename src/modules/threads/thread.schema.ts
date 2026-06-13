import { z } from 'zod';

export const startThreadSchema = z.object({
  propertyId: z.string().min(1),
});
export type StartThreadDto = z.infer<typeof startThreadSchema>;

const attachmentSchema = z.object({
  url: z.string().min(1).max(500),
  kind: z.enum(['image', 'video']),
  mimeType: z.string().max(80).optional(),
  size: z.number().int().min(0).optional(),
});

export const sendMessageSchema = z
  .object({
    body: z.string().max(4000).default(''),
    attachments: z.array(attachmentSchema).max(6).optional(),
  })
  .refine(
    (data) =>
      data.body.trim().length > 0 ||
      (data.attachments && data.attachments.length > 0),
    {
      message: 'Send some text or attach at least one file.',
      path: ['body'],
    },
  );
export type SendMessageDto = z.infer<typeof sendMessageSchema>;
