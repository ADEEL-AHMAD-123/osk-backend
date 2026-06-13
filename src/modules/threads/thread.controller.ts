import type { RequestHandler } from 'express';
import { ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import { threadService } from './thread.service';
import { toMessageDTO, toThreadDTO } from './thread.mapper';
import {
  sendMessageSchema,
  startThreadSchema,
} from './thread.schema';

export const startThread: RequestHandler = async (req, res) => {
  const parsed = startThreadSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const thread = await threadService.startThread(
    parsed.data.propertyId,
    req.user!,
  );
  sendSuccess(res, toThreadDTO(thread, req.user!.id), { status: 201 });
};

export const listThreads: RequestHandler = async (req, res) => {
  const threads = await threadService.listForUser(req.user!);
  sendSuccess(
    res,
    threads.map((t) => toThreadDTO(t, req.user!.id)),
  );
};

export const getThread: RequestHandler = async (req, res) => {
  const thread = await threadService.getById(
    req.params.id ?? '',
    req.user!,
  );
  sendSuccess(res, toThreadDTO(thread, req.user!.id));
};

export const listMessages: RequestHandler = async (req, res) => {
  const messages = await threadService.listMessages(
    req.params.id ?? '',
    req.user!,
  );
  sendSuccess(res, messages.map(toMessageDTO));
};

export const sendMessage: RequestHandler = async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const message = await threadService.send(
    req.params.id ?? '',
    parsed.data.body,
    req.user!,
    parsed.data.attachments,
  );
  sendSuccess(res, toMessageDTO(message), { status: 201 });
};
