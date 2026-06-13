import { Schema, Types, model, type Document } from 'mongoose';

/**
 * Auditable actions across the platform. Keep this list tight; once an
 * action is recorded with a string it lives forever in the log.
 */
export type AuditAction =
  | 'user.role.update'
  | 'user.status.update'
  | 'user.impersonate'
  | 'property.approve'
  | 'property.reject'
  | 'property.feature'
  | 'property.unfeature'
  | 'review.delete'
  | 'settings.update';

export interface AuditLogDoc extends Document {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  /** Snapshot of the actor at the time of the action — survives later renames. */
  actorEmail: string;
  actorName: string;
  action: AuditAction;
  /** What the action operated on — e.g. user id, property id, review id. */
  entityType: 'user' | 'property' | 'review' | 'settings';
  entityId: string;
  /** Free-form metadata: { before: 'buyer', after: 'agent' }, etc. */
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorEmail: { type: String, required: true, trim: true, lowercase: true },
    actorName: { type: String, required: true, trim: true },
    action: {
      type: String,
      required: true,
      enum: [
        'user.role.update',
        'user.status.update',
        'user.impersonate',
        'property.approve',
        'property.reject',
        'property.feature',
        'property.unfeature',
        'review.delete',
        'settings.update',
      ],
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: ['user', 'property', 'review', 'settings'],
    },
    entityId: { type: String, required: true, index: true },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/* Per the architecture blueprint: {entity:1, createdAt:-1} compound + TTL 365d. */
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export const AuditLogModel = model<AuditLogDoc>('AuditLog', auditLogSchema);
