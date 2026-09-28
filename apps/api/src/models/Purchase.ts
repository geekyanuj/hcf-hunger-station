import { Schema, model, Document, Types } from 'mongoose';

export interface IPurchaseItem {
  inventoryItemId: Types.ObjectId;
  name: string; // snapshot
  quantity: number;
  rate: number; // cost per unit for this purchase
  taxPercent: number;
  lineTotal: number; // quantity * rate * (1 + taxPercent/100)
}

export type PurchaseStatus = 'DRAFT' | 'COMPLETED' | 'CANCELLED';
export type PurchasePaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';

export interface IPurchase extends Document {
  purchaseNumber: string;
  outletId: Types.ObjectId;
  supplierId: Types.ObjectId;
  items: IPurchaseItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentStatus: PurchasePaymentStatus;
  invoiceNumber?: string;
  purchaseDate: Date;
  status: PurchaseStatus;
  createdByUserId: Types.ObjectId;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseItemSchema = new Schema<IPurchaseItem>(
  {
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    rate: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const PurchaseSchema = new Schema<IPurchase>(
  {
    purchaseNumber: { type: String, required: true, unique: true },
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: { type: [PurchaseItemSchema], required: true, validate: (v: unknown[]) => v.length > 0 },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['PENDING', 'PARTIAL', 'PAID'], default: 'PENDING' },
    invoiceNumber: { type: String },
    purchaseDate: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ['DRAFT', 'COMPLETED', 'CANCELLED'], default: 'DRAFT' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

PurchaseSchema.index({ purchaseNumber: 1 }, { unique: true });
PurchaseSchema.index({ outletId: 1, status: 1, createdAt: -1 });
PurchaseSchema.index({ outletId: 1, supplierId: 1 });

export const Purchase = model<IPurchase>('Purchase', PurchaseSchema);
