import { Types } from 'mongoose';
import { InventoryItem } from '../models/InventoryItem';
import { InventoryLedger, LedgerTransactionType, LedgerReferenceType } from '../models/InventoryLedger';
import { ApiError } from '../utils/ApiError';
import { getIO } from '../sockets';

export interface RecordMovementInput {
  inventoryItemId: string | Types.ObjectId;
  outletId: string | Types.ObjectId;
  /** Signed delta: positive increases stock (PURCHASE, ADJUSTMENT-up, RETURN, TRANSFER_IN), negative decreases it. */
  delta: number;
  type: LedgerTransactionType;
  referenceType: LedgerReferenceType;
  referenceId?: string | Types.ObjectId;
  userId?: string | Types.ObjectId;
  notes?: string;
  /** If true, stock is allowed to go negative (used only for sale consumption when a manager has overridden a stock check). Defaults to false. */
  allowNegative?: boolean;
}

export interface MovementResult {
  skippedDuplicate: boolean;
  previousStock?: number;
  newStock?: number;
}

/**
 * Every stock mutation in the system — purchases, sale consumption, wastage,
 * manual adjustments, transfers, returns — MUST go through this function.
 * It is the single writer that (a) atomically updates InventoryItem.currentStock
 * and (b) records the InventoryLedger entry in the same logical step, so a
 * ledger entry without a matching stock change (or vice versa) can't happen
 * from application code.
 *
 * Idempotency: when `referenceId` is provided, the ledger's unique index on
 * (referenceType, referenceId, inventoryItemId, type) rejects a duplicate
 * insert. On that specific error we treat the call as a no-op success rather
 * than raising — this is what makes order-completion-triggered consumption
 * safe to call more than once (retries, duplicate socket events, etc).
 */
export const LedgerService = {
  async recordMovement(input: RecordMovementInput): Promise<MovementResult> {
    const item = await InventoryItem.findOne({ _id: input.inventoryItemId, outletId: input.outletId });
    if (!item) throw ApiError.notFound('Inventory item not found for this outlet');

    const previousStock = item.currentStock;
    const newStock = previousStock + input.delta;

    if (newStock < 0 && !input.allowNegative) {
      throw ApiError.badRequest(
        `Insufficient stock for "${item.name}": have ${previousStock} ${item.unit}, need ${-input.delta} ${item.unit}`
      );
    }

    // Write the ledger entry FIRST so the unique-index duplicate check can
    // short-circuit before we touch the stock figure at all.
    try {
      await InventoryLedger.create({
        inventoryItemId: item._id,
        outletId: input.outletId,
        quantity: input.delta,
        previousStock,
        newStock,
        type: input.type,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        userId: input.userId,
        notes: input.notes,
      });
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === 11000) {
        // Duplicate (referenceType, referenceId, inventoryItemId, type) — this
        // exact movement was already recorded. Idempotent no-op.
        return { skippedDuplicate: true };
      }
      throw err;
    }

    item.currentStock = newStock;
    await item.save();

    notifyStockThresholds(item);

    return { skippedDuplicate: false, previousStock, newStock };
  },
};

function notifyStockThresholds(item: InstanceType<typeof InventoryItem>) {
  try {
    const io = getIO();
    const payload = {
      inventoryItemId: item.id,
      name: item.name,
      outletId: item.outletId.toString(),
      currentStock: item.currentStock,
      minimumStock: item.minimumStock,
      unit: item.unit,
    };
    if (item.currentStock <= 0) {
      io.to(`outlet:${item.outletId}:staff`).emit('inventory:out', payload);
    } else if (item.currentStock < item.minimumStock) {
      io.to(`outlet:${item.outletId}:staff`).emit('inventory:low', payload);
    }
  } catch {
    // socket layer unavailable (e.g. tests, or before initSockets runs) - non-fatal
  }
}
