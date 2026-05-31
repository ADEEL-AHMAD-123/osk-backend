import type { Request } from 'express';
import mongoose from 'mongoose';
import type { AuthUser } from '../../shared/middleware/auth';
import { UserModel } from '../auth/user.model';
import { AuditLogModel, type AuditAction, type AuditLogDoc } from './audit.model';

interface RecordParams {
  actor: AuthUser;
  action: AuditAction;
  entityType: AuditLogDoc['entityType'];
  entityId: string;
  meta?: Record<string, unknown>;
  /** Optional request for ip/ua snapshot. */
  req?: Request;
}

/** A flat, list-friendly DTO for the admin activity feed. */
export interface AuditEntryDTO {
  id: string;
  actorId: string;
  actorEmail: string;
  actorName: string;
  action: AuditAction;
  entityType: AuditLogDoc['entityType'];
  entityId: string;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

function toDTO(doc: AuditLogDoc): AuditEntryDTO {
  return {
    id: doc._id.toString(),
    actorId: doc.actorId.toString(),
    actorEmail: doc.actorEmail,
    actorName: doc.actorName,
    action: doc.action,
    entityType: doc.entityType,
    entityId: doc.entityId,
    meta: doc.meta,
    ip: doc.ip,
    userAgent: doc.userAgent,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const auditService = {
  /**
   * Record an audit entry. Snapshots actor name/email at log time so the
   * record stays meaningful even after a later rename. Failures are
   * swallowed (and logged elsewhere) so a logging miss never breaks the
   * underlying admin action.
   */
  async record(params: RecordParams): Promise<void> {
    try {
      const actorUser = mongoose.isValidObjectId(params.actor.id)
        ? await UserModel.findById(params.actor.id)
            .select('name email')
            .lean()
            .exec()
        : null;

      await AuditLogModel.create({
        actorId: params.actor.id,
        actorEmail: actorUser?.email ?? params.actor.email,
        actorName: actorUser?.name ?? params.actor.email,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        meta: params.meta,
        ip: params.req?.ip,
        userAgent: params.req?.get('user-agent'),
      });
    } catch {
      /* never throw out of the audit pipeline */
    }
  },

  async list(
    page: number,
    limit: number,
  ): Promise<{ items: AuditEntryDTO[]; total: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      AuditLogModel.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      AuditLogModel.countDocuments({}).exec(),
    ]);
    return { items: items.map(toDTO), total };
  },
};
