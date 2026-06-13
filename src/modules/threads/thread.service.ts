import mongoose, { Types } from 'mongoose';
import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../shared/errors';
import { logger } from '../../config/logger';
import type { AuthUser } from '../../shared/middleware/auth';
import { propertyRepository } from '../properties/property.repository';
import { notificationService } from '../notifications/notification.service';
import { emitThreadMessage } from '../../realtime/io';
import { MessageModel, type MessageDoc } from './message.model';
import { ThreadModel, type ThreadDoc } from './thread.model';
import { toMessageDTO } from './thread.mapper';

/* Field projections used by every populate. Shared as named consts so the
 * shape stays in lockstep with the `PopulatedUser`/`PopulatedProperty`
 * narrowers in thread.mapper.ts. */
const POPULATE_USER = 'name email role avatarUrl';
const POPULATE_PROPERTY = 'slug title thumbnail';

/** Re-fetch a thread with participants + property populated. */
async function withPopulate(thread: ThreadDoc): Promise<ThreadDoc> {
  return thread.populate([
    { path: 'participants', select: POPULATE_USER },
    { path: 'propertyId', select: POPULATE_PROPERTY },
  ]);
}

function assertDbReady(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new ServiceUnavailableError(
      'Database unavailable — start MongoDB and try again',
    );
  }
}

function ensureMember(thread: ThreadDoc, userId: string): void {
  /* Participants may be populated (User docs) or raw ObjectIds depending
   * on the read path. Handle both — read `_id` first, fall back to the
   * value itself for unpopulated refs. */
  const isMember = thread.participants.some((p) => {
    const raw = p as unknown as { _id?: { toString(): string } };
    const id = raw && raw._id ? raw._id.toString() : String(p);
    return id === userId;
  });
  if (!isMember) {
    throw new ForbiddenError('You are not a member of this thread');
  }
}

export const threadService = {
  /** Idempotent: returns the existing buyer-owner thread for this property. */
  async startThread(
    propertyId: string,
    actor: AuthUser,
  ): Promise<ThreadDoc> {
    assertDbReady();
    if (!mongoose.isValidObjectId(propertyId)) {
      throw new NotFoundError('Property not found');
    }
    const property = await propertyRepository.findById(propertyId);
    if (!property) throw new NotFoundError('Property not found');

    const ownerId = property.owner as Types.ObjectId;
    if (ownerId.toString() === actor.id) {
      throw new ForbiddenError('You can’t start a chat with yourself');
    }

    const initiatorId = new Types.ObjectId(actor.id);
    const existing = await ThreadModel.findOne({
      propertyId,
      initiatorId,
    }).exec();
    if (existing) return withPopulate(existing);

    const created = await ThreadModel.create({
      propertyId,
      participants: [ownerId, initiatorId],
      ownerId,
      initiatorId,
      lastMessageAt: new Date(),
      unread: new Map<string, number>([
        [ownerId.toString(), 0],
        [initiatorId.toString(), 0],
      ]),
    });
    return withPopulate(created);
  },

  async listForUser(actor: AuthUser): Promise<ThreadDoc[]> {
    assertDbReady();
    return ThreadModel.find({ participants: actor.id })
      .sort({ lastMessageAt: -1 })
      .limit(60)
      .populate('participants', POPULATE_USER)
      .populate('propertyId', POPULATE_PROPERTY)
      .exec();
  },

  async getById(id: string, actor: AuthUser): Promise<ThreadDoc> {
    assertDbReady();
    if (!mongoose.isValidObjectId(id)) {
      throw new NotFoundError('Thread not found');
    }
    const thread = await ThreadModel.findById(id)
      .populate('participants', POPULATE_USER)
      .populate('propertyId', POPULATE_PROPERTY)
      .exec();
    if (!thread) throw new NotFoundError('Thread not found');
    ensureMember(thread, actor.id);
    return thread;
  },

  async listMessages(
    threadId: string,
    actor: AuthUser,
  ): Promise<MessageDoc[]> {
    /* Reset unread for this reader as a side-effect of opening the thread. */
    const thread = await this.getById(threadId, actor);
    if ((thread.unread.get(actor.id) ?? 0) > 0) {
      thread.unread.set(actor.id, 0);
      await thread.save();
    }
    return MessageModel.find({ threadId: thread._id })
      .sort({ createdAt: 1 })
      .limit(500)
      .exec();
  },

  async send(
    threadId: string,
    body: string,
    actor: AuthUser,
    attachments?: Array<{
      url: string;
      kind: 'image' | 'video';
      mimeType?: string;
      size?: number;
    }>,
  ): Promise<MessageDoc> {
    const thread = await this.getById(threadId, actor);
    const message = await MessageModel.create({
      threadId: thread._id,
      senderId: actor.id,
      body,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    });

    /* Bump lastMessageAt + recipient unread counter. */
    thread.lastMessageAt = message.createdAt;
    for (const participant of thread.participants) {
      const raw = participant as unknown as { _id?: Types.ObjectId };
      const pidObj = raw && raw._id ? raw._id : (participant as Types.ObjectId);
      const pid = pidObj.toString();
      if (pid !== actor.id) {
        thread.unread.set(pid, (thread.unread.get(pid) ?? 0) + 1);
        void notificationService
          .notify({
            userId: pidObj,
            type: 'system',
            title: 'New message',
            body: body.slice(0, 200),
            href: `/dashboard/messages/${thread._id.toString()}`,
            meta: { threadId: thread._id.toString() },
          })
          .catch((err) => logger.warn({ err }, 'notify failed'));
      }
    }
    await thread.save();

    /* Real-time fan-out — every member of the thread room gets the message
     * instantly. Polling still works for clients that miss the socket. */
    emitThreadMessage(thread._id.toString(), toMessageDTO(message));

    return message;
  },
};
