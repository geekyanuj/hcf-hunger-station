import { Types } from 'mongoose';
import { Wastage, WastageReason } from '../models/Wastage';
import { InventoryItem } from '../models/InventoryItem';
import { ApiError } from '../utils/ApiError';
import { round2 } from '../utils/format';
import { LedgerService } from './ledger.service';
import { AuditService, AuditContext } from './audit.service';

export const WastageService = {
  async list(outletId: string, filters: { reason?: WastageReason; page: number; limit: number }) {
    const query: Record<string, unknown> = { outletId };
    if (filters.reason) query.reason = filters.reason;
    const [items, total] = await Promise.all([
      Wastage.find(query)
        .populate('inventoryItemId', 'name unit')
        .populate('recordedByUserId', 'name')
        .sort({ createdAt: -1 })
        .skip((filters.page - 1) * filters.limit)
        .limit(filters.limit),
      Wastage.countDocuments(query),
    ]);
    return { items, total };
  },

  /** Records a wastage event and immediately decreases stock via the ledger. */
  async create(
    outletId: string,
    inventoryItemId: string,
    quantity: number,
    reason: WastageReason,
    notes: string | undefined,
    ctx: AuditContext
  ) {
    const item = await InventoryItem.findOne({ _id: inventoryItemId, outletId, isDeleted: false });
    if (!item) throw ApiError.notFound('Inventory item not found for this outlet');

    const estimatedValue = round2(quantity * item.costPerUnit);

    const wastage = await Wastage.create({
      outletId,
      inventoryItemId,
      quantity,
      reason,
      notes,
      estimatedValue,
      recordedByUserId: ctx.userId,
    });

    await LedgerService.recordMovement({
      inventoryItemId,
      outletId,
      delta: -quantity,
      type: 'WASTAGE',
      referenceType: 'WASTAGE',
      referenceId: wastage._id as never,
      userId: ctx.userId,
      notes: `Wastage: ${reason}${notes ? ` — ${notes}` : ''}`,
      allowNegative: true, // wastage is recorded even if it drives stock below zero (data-entry lag); flagged for review via low/out-of-stock alerts
    });

    await AuditService.record({
      ctx,
      action: 'WASTAGE_RECORDED',
      entity: 'Wastage',
      entityId: wastage.id,
      outletId,
      after: { inventoryItemId, quantity, reason, estimatedValue },
    });

    return wastage;
  },

  async totalValueForPeriod(outletId: string, since: Date) {
    const result = await Wastage.aggregate([
      { $match: { outletId: new Types.ObjectId(outletId), createdAt: { $gte: since } } },
      { $group: { _id: null, value: { $sum: '$estimatedValue' } } },
    ]);
    return result[0]?.value ?? 0;
  },
};
