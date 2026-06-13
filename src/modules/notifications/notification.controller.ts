import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../shared/errors';
import { sendSuccess, buildMeta } from '../../shared/response';
import { notificationService } from './notification.service';
import type { NotificationDoc } from './notification.model';

const filtersSchema = z.object({
  read: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(24),
});

interface NotificationDTO {
  id: string;
  type: NotificationDoc['type'];
  title: string;
  body?: string;
  href?: string;
  read: boolean;
  meta?: Record<string, unknown>;
  createdAt: string;
}

function toDTO(doc: NotificationDoc): NotificationDTO {
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    href: doc.href,
    read: doc.read,
    meta: doc.meta,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const listNotifications: RequestHandler = async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const { items, total, unread } = await notificationService.listForUser(
    req.user!.id,
    parsed.data,
  );
  sendSuccess(
    res,
    items.map(toDTO),
    {
      meta: {
        ...buildMeta(parsed.data.page, parsed.data.limit, total),
        unread,
      },
    },
  );
};

export const markRead: RequestHandler = async (req, res) => {
  const doc = await notificationService.markRead(
    req.params.id ?? '',
    req.user!.id,
  );
  sendSuccess(res, toDTO(doc));
};

export const markAllRead: RequestHandler = async (req, res) => {
  const result = await notificationService.markAllRead(req.user!.id);
  sendSuccess(res, result);
};
