import { Types } from 'mongoose';
import { InventoryItem } from '../models/InventoryItem';
import { InventoryLedger } from '../models/InventoryLedger';
import { ApiError } from '../utils/ApiError';
import { LedgerService } from './ledger.service';
import { AuditService, AuditContext } from './audit.service';

export const InventoryService = {
  async list(filters: { outletId: string; category?: string; lowStockOnly?: boolean; search?: string; page: number; limit: number }) {
    const query: Record<string, unknown> = { outletId: filters.outletId, isDeleted: false };
    if (filters.category) query.category = filters.category;
    if (filters.search) query.name = { $regex: filters.search, $options: 'i' };
    if (filters.lowStockOnly) query.$expr = { $lt: ['$currentStock', '$minimumStock'] };

    const [items, total] = await Promise.all([
      InventoryItem.find(query)
        .populate('supplierId', 'name phone')
        .sort({ name: 1 })
        .skip((filters.page - 1) * filters.limit)
        .limit(filters.limit),
      InventoryItem.countDocuments(query),
    ]);
    return { items, total };
  },

  async getById(id: string) {
    const item = await InventoryItem.findOne({ _id: id, isDeleted: false }).populate('supplierId', 'name phone');
    if (!item) throw ApiError.notFound('Inventory item not found');
    return item;
  },

  async create(payload: Record<string, unknown>) {
    return InventoryItem.create(payload);
  },

  async update(id: string, payload: Record<string, unknown>) {
    // currentStock is intentionally excluded from generic updates — it may
    // only change through LedgerService.recordMovement (adjustStock below),
    // so every stock change always has a ledger entry.
    const { currentStock: _ignored, ...safePayload } = payload;
    const item = await InventoryItem.findOneAndUpdate({ _id: id, isDeleted: false }, safePayload, { new: true });
    if (!item) throw ApiError.notFound('Inventory item not found');
    return item;
  },

  async softDelete(id: string) {
    const item = await InventoryItem.findOneAndUpdate({ _id: id }, { isDeleted: true, isActive: false }, { new: true });
    if (!item) throw ApiError.notFound('Inventory item not found');
    return item;
  },

  /** Manual stock adjustment (stocktake correction, damage not covered by wastage flow, etc). Always ledgered. */
  async adjustStock(
    id: string,
    outletId: string,
    delta: number,
    notes: string | undefined,
    ctx: AuditContext
  ) {
    const item = await this.getById(id);
    const before = { currentStock: item.currentStock };
    const result = await LedgerService.recordMovement({
      inventoryItemId: id,
      outletId,
      delta,
      type: 'ADJUSTMENT',
      referenceType: 'MANUAL',
      userId: ctx.userId,
      notes,
    });
    await AuditService.record({
      ctx,
      action: 'STOCK_ADJUSTMENT',
      entity: 'InventoryItem',
      entityId: id,
      outletId,
      before,
      after: { currentStock: result.newStock },
    });
    return this.getById(id);
  },

  async lowStockCount(outletId: string) {
    return InventoryItem.countDocuments({
      outletId,
      isDeleted: false,
      $expr: { $lt: ['$currentStock', '$minimumStock'] },
    });
  },

  async outOfStockCount(outletId: string) {
    return InventoryItem.countDocuments({ outletId, isDeleted: false, currentStock: { $lte: 0 } });
  },

  /** "Critical" is tighter than "low": stock has fallen to/below the item's own reorderLevel (still >0) — configurable per item, never hard-coded. */
  async criticalStockCount(outletId: string) {
    return InventoryItem.countDocuments({
      outletId,
      isDeleted: false,
      currentStock: { $gt: 0 },
      $expr: { $lte: ['$currentStock', '$reorderLevel'] },
    });
  },

  async totalInventoryValue(outletId: string) {
    const result = await InventoryItem.aggregate([
      { $match: { outletId: new Types.ObjectId(outletId), isDeleted: false } },
      { $group: { _id: null, value: { $sum: { $multiply: ['$currentStock', '$costPerUnit'] } } } },
    ]);
    return result[0]?.value ?? 0;
  },

  async ledgerForItem(inventoryItemId: string, page: number, limit: number) {
    const query = { inventoryItemId };
    const [items, total] = await Promise.all([
      InventoryLedger.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      InventoryLedger.countDocuments(query),
    ]);
    return { items, total };
  },

  async ledgerForOutlet(outletId: string, filters: { type?: string; page: number; limit: number }) {
    const query: Record<string, unknown> = { outletId };
    if (filters.type) query.type = filters.type;
    const [items, total] = await Promise.all([
      InventoryLedger.find(query)
        .populate('inventoryItemId', 'name unit sku')
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip((filters.page - 1) * filters.limit)
        .limit(filters.limit),
      InventoryLedger.countDocuments(query),
    ]);
    return { items, total };
  },
};
