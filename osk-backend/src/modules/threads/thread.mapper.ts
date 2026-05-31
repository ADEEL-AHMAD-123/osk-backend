import type { Types } from 'mongoose';
import type { MessageDoc } from './message.model';
import type { ThreadDoc } from './thread.model';

/**
 * Public-facing thread shape. `counterpart` and `property` are populated on
 * the read paths so the chat UI can render "Chat with Jane Smith about
 * 'Skyline Villa'" without an extra fetch per row.
 */
export interface ThreadCounterpartDTO {
  id: string;
  name: string;
  email: string;
  role: 'buyer' | 'seller' | 'agent' | 'admin';
  avatarUrl?: string;
  /** True when this person owns the listing the thread is about. */
  isOwner: boolean;
}

export interface ThreadPropertyDTO {
  id: string;
  slug: string;
  title: string;
  thumbnail: string;
}

export interface ThreadDTO {
  id: string;
  propertyId: string;
  ownerId: string;
  initiatorId: string;
  participants: string[];
  lastMessageAt: string;
  unread: number;
  createdAt: string;
  /** The OTHER participant from the viewer's POV. Always present once
   * the populate path runs (every list/get goes through populate). */
  counterpart?: ThreadCounterpartDTO;
  property?: ThreadPropertyDTO;
}

export interface MessageAttachmentDTO {
  url: string;
  kind: 'image' | 'video';
  mimeType?: string;
  size?: number;
}

export interface MessageDTO {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  attachments?: MessageAttachmentDTO[];
  createdAt: string;
}

/* Mongoose's `.populate()` returns nested docs typed as `unknown` to a
 * casual TypeScript reader. We narrow them ourselves here — the shape
 * comes from the `.select()` calls in thread.service.ts. */
interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: ThreadCounterpartDTO['role'];
  avatarUrl?: string;
}

interface PopulatedProperty {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  thumbnail: string;
}

function isPopulatedUser(value: unknown): value is PopulatedUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'email' in value &&
    'role' in value
  );
}

function isPopulatedProperty(value: unknown): value is PopulatedProperty {
  return (
    typeof value === 'object' &&
    value !== null &&
    'slug' in value &&
    'title' in value &&
    'thumbnail' in value
  );
}

export function toThreadDTO(doc: ThreadDoc, viewerId: string): ThreadDTO {
  /* Counterpart = the participant whose id !== viewer. We walk the
   * populated participants array; if populate didn't run (e.g. fresh
   * Mongoose create), the counterpart block is omitted gracefully. */
  let counterpart: ThreadCounterpartDTO | undefined;
  for (const p of doc.participants) {
    if (!isPopulatedUser(p)) continue;
    const pid = p._id.toString();
    if (pid === viewerId) continue;
    counterpart = {
      id: pid,
      name: p.name,
      email: p.email,
      role: p.role,
      avatarUrl: p.avatarUrl,
      isOwner: doc.ownerId.toString() === pid,
    };
    break;
  }

  let property: ThreadPropertyDTO | undefined;
  if (isPopulatedProperty(doc.propertyId)) {
    property = {
      id: doc.propertyId._id.toString(),
      slug: doc.propertyId.slug,
      title: doc.propertyId.title,
      thumbnail: doc.propertyId.thumbnail,
    };
  }

  return {
    id: doc._id.toString(),
    propertyId: property?.id ?? doc.propertyId.toString(),
    ownerId: doc.ownerId.toString(),
    initiatorId: doc.initiatorId.toString(),
    participants: doc.participants.map((p) =>
      isPopulatedUser(p) ? p._id.toString() : p.toString(),
    ),
    lastMessageAt: doc.lastMessageAt.toISOString(),
    unread: doc.unread.get(viewerId) ?? 0,
    createdAt: doc.createdAt.toISOString(),
    counterpart,
    property,
  };
}

export function toMessageDTO(doc: MessageDoc): MessageDTO {
  return {
    id: doc._id.toString(),
    threadId: doc.threadId.toString(),
    senderId: doc.senderId.toString(),
    body: doc.body,
    attachments: doc.attachments?.map((a) => ({
      url: a.url,
      kind: a.kind,
      mimeType: a.mimeType,
      size: a.size,
    })),
    createdAt: doc.createdAt.toISOString(),
  };
}
