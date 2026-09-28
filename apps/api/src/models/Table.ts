import { Schema, model, Document, Types } from 'mongoose';

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'INACTIVE';

export interface ITable extends Document {
  outletId: Types.ObjectId;
  tableNumber: string; // "12"
  qrToken: string; // secure random identifier embedded in the QR code URL
  capacity: number;
  /** Live occupancy status. INACTIVE mirrors isActive=false for display; the other three are managed by staff/order flow. */
  status: TableStatus;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TableSchema = new Schema<ITable>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    tableNumber: { type: String, required: true },
    qrToken: { type: String, required: true, unique: true },
    capacity: { type: Number, default: 4 },
    status: { type: String, enum: ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'INACTIVE'], default: 'AVAILABLE' },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TableSchema.index({ outletId: 1, tableNumber: 1 }, { unique: true });
TableSchema.index({ qrToken: 1 }, { unique: true });

export const Table = model<ITable>('Table', TableSchema);
