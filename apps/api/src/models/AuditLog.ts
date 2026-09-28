import { Schema, model, Document, Types } from 'mongoose';

export type AuditAction =
  | 'STOCK_ADJUSTMENT'
  | 'RECIPE_CHANGE'
  | 'PRICE_CHANGE'
  | 'ORDER_CANCELLATION'
  | 'REFUND'
  | 'PURCHASE_COMPLETED'
  | 'WASTAGE_RECORDED'
  | 'USER_PERMISSION_CHANGE'
  | 'STOCK_OVERRIDE';

export interface IAuditLog extends Document {
  userId: Types.ObjectId;
  action: AuditAction;
  entity: string; // collection/model name, e.g. "MenuItem", "InventoryItem", "Order"
  entityId: Types.ObjectId;
  outletId?: Types.ObjectId;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: [
        'STOCK_ADJUSTMENT',
        'RECIPE_CHANGE',
        'PRICE_CHANGE',
        'ORDER_CANCELLATION',
        'REFUND',
        'PURCHASE_COMPLETED',
        'WASTAGE_RECORDED',
        'USER_PERMISSION_CHANGE',
        'STOCK_OVERRIDE',
      ],
      required: true,
    },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet' },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ outletId: 1, createdAt: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
