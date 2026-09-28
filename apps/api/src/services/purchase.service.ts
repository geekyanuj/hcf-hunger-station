import { Purchase, IPurchaseItem } from '../models/Purchase';
import { InventoryItem } from '../models/InventoryItem';
import { ApiError } from '../utils/ApiError';
import { getNextSequence } from '../models/Counter';
import { round2 } from '../utils/format';
import { LedgerService } from './ledger.service';
import { AuditService, AuditContext } from './audit.service';

export interface PurchaseLineInput {
  inventoryItemId: string;
  quantity: number;
  rate: number;
  taxPercent?: number;
}

export const PurchaseService = {
  async list(outletId: string, filters: { status?: string; supplierId?: string; page: number; limit: number }) {
    const query: Record<string, unknown> = { outletId };
    if (filters.status) query.status = filters.status;
    if (filters.supplierId) query.supplierId = filters.supplierId;
    const [items, total] = await Promise.all([
      Purchase.find(query)
        .populate('supplierId', 'name phone')
        .sort({ createdAt: -1 })
        .skip((filters.page - 1) * filters.limit)
        .limit(filters.limit),
      Purchase.countDocuments(query),
    ]);
    return { items, total };
  },

  async getById(id: string) {
    const purchase = await Purchase.findById(id).populate('supplierId', 'name phone').populate('items.inventoryItemId', 'name unit');
    if (!purchase) throw ApiError.notFound('Purchase not found');
    return purchase;
  },

  /** Creates a purchase in DRAFT status — stock is NOT affected until `complete()` is called. */
  async create(
    outletId: string,
    supplierId: string,
    lines: PurchaseLineInput[],
    invoiceNumber: string | undefined,
    purchaseDate: string | undefined,
    createdByUserId: string
  ) {
    if (lines.length === 0) throw ApiError.badRequest('A purchase needs at least one line item');

    const inventoryItemIds = lines.map((l) => l.inventoryItemId);
    const items = await InventoryItem.find({ _id: { $in: inventoryItemIds }, outletId, isDeleted: false });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const purchaseItems: IPurchaseItem[] = [];
    let subtotal = 0;
    let tax = 0;

    for (const line of lines) {
      const item = itemMap.get(line.inventoryItemId);
      if (!item) throw ApiError.badRequest(`Inventory item ${line.inventoryItemId} not found for this outlet`);
      const taxPercent = line.taxPercent ?? 0;
      const lineSubtotal = round2(line.quantity * line.rate);
      const lineTax = round2(lineSubtotal * (taxPercent / 100));
      const lineTotal = round2(lineSubtotal + lineTax);
      subtotal += lineSubtotal;
      tax += lineTax;
      purchaseItems.push({
        inventoryItemId: item._id as never,
        name: item.name,
        quantity: line.quantity,
        rate: line.rate,
        taxPercent,
        lineTotal,
      });
    }

    const seq = await getNextSequence(`PURCHASE:${outletId}`);
    const purchaseNumber = `PO-${seq.toString().padStart(5, '0')}`;

    return Purchase.create({
      purchaseNumber,
      outletId,
      supplierId,
      items: purchaseItems,
      subtotal: round2(subtotal),
      tax: round2(tax),
      total: round2(subtotal + tax),
      invoiceNumber,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      status: 'DRAFT',
      createdByUserId,
    });
  },

  /**
   * Marks a purchase COMPLETED and increases inventory stock for every line
   * item, each recorded as its own PURCHASE ledger entry. Idempotent at the
   * purchase level: completing an already-completed purchase is rejected
   * outright (status guard) rather than silently re-applying stock.
   */
  async complete(id: string, ctx: AuditContext) {
    const purchase = await Purchase.findById(id);
    if (!purchase) throw ApiError.notFound('Purchase not found');
    if (purchase.status === 'COMPLETED') throw ApiError.conflict('Purchase has already been completed');
    if (purchase.status === 'CANCELLED') throw ApiError.badRequest('Cannot complete a cancelled purchase');

    for (const line of purchase.items) {
      await LedgerService.recordMovement({
        inventoryItemId: line.inventoryItemId,
        outletId: purchase.outletId,
        delta: line.quantity,
        type: 'PURCHASE',
        referenceType: 'PURCHASE',
        referenceId: purchase._id as never,
        userId: ctx.userId,
        notes: `Purchase ${purchase.purchaseNumber}`,
      });
      // Keep costPerUnit reasonably current: update to the latest purchase rate.
      await InventoryItem.updateOne({ _id: line.inventoryItemId }, { costPerUnit: line.rate });
    }

    purchase.status = 'COMPLETED';
    purchase.completedAt = new Date();
    await purchase.save();

    await AuditService.record({
      ctx,
      action: 'PURCHASE_COMPLETED',
      entity: 'Purchase',
      entityId: purchase.id,
      outletId: purchase.outletId.toString(),
      after: { purchaseNumber: purchase.purchaseNumber, total: purchase.total },
    });

    return purchase;
  },

  async cancel(id: string) {
    const purchase = await Purchase.findById(id);
    if (!purchase) throw ApiError.notFound('Purchase not found');
    if (purchase.status === 'COMPLETED') throw ApiError.badRequest('Cannot cancel a completed purchase — stock has already been received');
    purchase.status = 'CANCELLED';
    await purchase.save();
    return purchase;
  },

  async updatePaymentStatus(id: string, paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID') {
    const purchase = await Purchase.findByIdAndUpdate(id, { paymentStatus }, { new: true });
    if (!purchase) throw ApiError.notFound('Purchase not found');
    return purchase;
  },
};
