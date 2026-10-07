import { Schema, model, Document, Types } from 'mongoose';

export type PrintJobType = 'TOKEN' | 'TEST';
/**
 * PRINTED  - legacy: bytes were delivered to a thermal printer.
 * BROWSER  - a browser print preview was prepared.
 * FAILED   - legacy: direct printer delivery failed (see `error`).
 */
export type PrintJobStatus = 'PRINTED' | 'BROWSER' | 'FAILED';

export interface IPrintJob extends Document {
  outletId: Types.ObjectId;
  orderId?: Types.ObjectId;
  tokenNumber?: string;
  requestedBy: Types.ObjectId;
  type: PrintJobType;
  status: PrintJobStatus;
  driver: string;
  copies: number;
  isReprint: boolean;
  error?: string;
  createdAt: Date;
}

const PrintJobSchema = new Schema<IPrintJob>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    tokenNumber: { type: String },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['TOKEN', 'TEST'], required: true },
    status: { type: String, enum: ['PRINTED', 'BROWSER', 'FAILED'], required: true },
    driver: { type: String, required: true },
    copies: { type: Number, default: 1 },
    isReprint: { type: Boolean, default: false },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PrintJobSchema.index({ outletId: 1, createdAt: -1 });
PrintJobSchema.index({ orderId: 1, createdAt: -1 });

export const PrintJob = model<IPrintJob>('PrintJob', PrintJobSchema);
