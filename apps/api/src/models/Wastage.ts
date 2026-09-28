import { Schema, model, Document, Types } from 'mongoose';

export type WastageReason =
  | 'BURNT_FOOD'
  | 'EXPIRED'
  | 'SPOILAGE'
  | 'PREPARATION_MISTAKE'
  | 'CANCELLATION'
  | 'DAMAGED_PACKAGING'
  | 'OTHER';

export interface IWastage extends Document {
  outletId: Types.ObjectId;
  inventoryItemId: Types.ObjectId;
  quantity: number;
  reason: WastageReason;
  notes?: string;
  estimatedValue: number; // quantity * inventoryItem.costPerUnit at the time of recording
  recordedByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WastageSchema = new Schema<IWastage>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    reason: {
      type: String,
      enum: ['BURNT_FOOD', 'EXPIRED', 'SPOILAGE', 'PREPARATION_MISTAKE', 'CANCELLATION', 'DAMAGED_PACKAGING', 'OTHER'],
      required: true,
    },
    notes: { type: String },
    estimatedValue: { type: Number, required: true },
    recordedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

WastageSchema.index({ outletId: 1, createdAt: -1 });
WastageSchema.index({ outletId: 1, inventoryItemId: 1 });

export const Wastage = model<IWastage>('Wastage', WastageSchema);
