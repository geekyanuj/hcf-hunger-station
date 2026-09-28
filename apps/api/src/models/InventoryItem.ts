import { Schema, model, Document, Types } from 'mongoose';

export type InventoryUnit = 'kg' | 'g' | 'litre' | 'ml' | 'piece' | 'packet' | 'box';

export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL';

export interface IInventoryItem extends Document {
  outletId: Types.ObjectId;
  name: string;
  sku: string;
  category: string; // e.g. "Produce", "Dairy", "Packaging" - free text in Part 2
  unit: InventoryUnit;
  currentStock: number;
  minimumStock: number;
  maximumStock: number;
  reorderLevel: number;
  costPerUnit: number;
  supplierId?: Types.ObjectId;
  expiryDate?: Date;
  batchNumber?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Virtual, computed from currentStock vs minimumStock — never stored/hard-coded. */
  stockStatus: StockStatus;
}

const InventoryItemSchema = new Schema<IInventoryItem>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    category: { type: String, required: true, trim: true },
    unit: { type: String, enum: ['kg', 'g', 'litre', 'ml', 'piece', 'packet', 'box'], required: true },
    currentStock: { type: Number, required: true, default: 0 },
    minimumStock: { type: Number, required: true, default: 0 },
    maximumStock: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    costPerUnit: { type: Number, required: true, min: 0 },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    expiryDate: { type: Date },
    batchNumber: { type: String },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

InventoryItemSchema.virtual('stockStatus').get(function (this: IInventoryItem): StockStatus {
  if (this.currentStock <= 0) return 'OUT_OF_STOCK';
  if (this.currentStock < this.minimumStock) return 'LOW_STOCK';
  return 'NORMAL';
});

InventoryItemSchema.index({ outletId: 1, sku: 1 }, { unique: true });
InventoryItemSchema.index({ outletId: 1, category: 1 });
InventoryItemSchema.index({ outletId: 1, currentStock: 1 });

export const InventoryItem = model<IInventoryItem>('InventoryItem', InventoryItemSchema);
