import { Schema, model, Document, Types } from 'mongoose';

export type LedgerTransactionType =
  | 'PURCHASE'
  | 'SALE_CONSUMPTION'
  | 'WASTAGE'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN';

export type LedgerReferenceType = 'ORDER' | 'PURCHASE' | 'WASTAGE' | 'MANUAL' | 'TRANSFER';

export interface IInventoryLedger extends Document {
  inventoryItemId: Types.ObjectId;
  outletId: Types.ObjectId;
  quantity: number; // signed: positive increases stock, negative decreases it
  previousStock: number;
  newStock: number;
  type: LedgerTransactionType;
  referenceType: LedgerReferenceType;
  referenceId?: Types.ObjectId; // Order/Purchase/Wastage _id, when applicable
  userId?: Types.ObjectId; // who initiated it (absent for pure system-triggered consumption, but userId of the order-completing staff is preferred)
  notes?: string;
  createdAt: Date;
}

const InventoryLedgerSchema = new Schema<IInventoryLedger>(
  {
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    quantity: { type: Number, required: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    type: {
      type: String,
      enum: ['PURCHASE', 'SALE_CONSUMPTION', 'WASTAGE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN'],
      required: true,
    },
    referenceType: { type: String, enum: ['ORDER', 'PURCHASE', 'WASTAGE', 'MANUAL', 'TRANSFER'], required: true },
    referenceId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

InventoryLedgerSchema.index({ outletId: 1, inventoryItemId: 1, createdAt: -1 });
InventoryLedgerSchema.index({ outletId: 1, type: 1, createdAt: -1 });
/**
 * This is what makes stock consumption idempotent: for a given order
 * (referenceId) and a given ingredient, SALE_CONSUMPTION can only be recorded
 * once. If the "order completed" event fires twice (retry, duplicate socket
 * emit, double-click), the second attempt's ledger insert hits this unique
 * index and is rejected — see stockDeduction.service.ts.
 */
InventoryLedgerSchema.index(
  { referenceType: 1, referenceId: 1, inventoryItemId: 1, type: 1 },
  { unique: true, partialFilterExpression: { referenceId: { $exists: true } } }
);

export const InventoryLedger = model<IInventoryLedger>('InventoryLedger', InventoryLedgerSchema);
