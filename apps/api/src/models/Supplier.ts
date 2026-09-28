import { Schema, model, Document, Types } from 'mongoose';

export interface ISupplier extends Document {
  outletId: Types.ObjectId;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string; // free text, e.g. "Net 15", "COD"
  notes?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String },
    phone: { type: String, required: true },
    email: { type: String, lowercase: true },
    address: { type: String },
    gstin: { type: String },
    paymentTerms: { type: String },
    notes: { type: String },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SupplierSchema.index({ outletId: 1, name: 1 });

export const Supplier = model<ISupplier>('Supplier', SupplierSchema);
