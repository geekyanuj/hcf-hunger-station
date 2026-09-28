import { Types } from 'mongoose';
import { AuditLog, AuditAction } from '../models/AuditLog';

export interface AuditContext {
  userId?: string;
  ipAddress?: string;
}

export const AuditService = {
  async record(params: {
    ctx: AuditContext;
    action: AuditAction;
    entity: string;
    entityId: string | Types.ObjectId;
    outletId?: string | Types.ObjectId;
    before?: unknown;
    after?: unknown;
  }) {
    if (!params.ctx.userId) return; // no identifiable actor (e.g. guest self-service action) - nothing to attribute
    await AuditLog.create({
      userId: params.ctx.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      outletId: params.outletId,
      before: params.before,
      after: params.after,
      ipAddress: params.ctx.ipAddress,
    });
  },

  async list(filters: { outletId?: string; entity?: string; action?: AuditAction; page: number; limit: number }) {
    const query: Record<string, unknown> = {};
    if (filters.outletId) query.outletId = filters.outletId;
    if (filters.entity) query.entity = filters.entity;
    if (filters.action) query.action = filters.action;
    const [items, total] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip((filters.page - 1) * filters.limit)
        .limit(filters.limit),
      AuditLog.countDocuments(query),
    ]);
    return { items, total };
  },
};
