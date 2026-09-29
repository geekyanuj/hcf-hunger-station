import { Schema, model, Document, Types } from 'mongoose';

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'ONLINE';
export type PaymentTransactionStatus = 'INITIATED' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface IPayment extends Document {
  orderId: Types.ObjectId;
  outletId: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  provider: string; // "MOCK" in Part 1
  providerReferenceId?: string;
  providerPaymentId?: string;
  status: PaymentTransactionStatus;
  failureReason?: string;
  refundedAmount: number;
  rawWebhookPayloads: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['CASH', 'UPI', 'CARD', 'ONLINE'], required: true },
    provider: { type: String, required: true, default: 'MOCK' },
    providerReferenceId: { type: String },
    providerPaymentId: { type: String },
    status: { type: String, enum: ['INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED'], default: 'INITIATED' },
    failureReason: { type: String },
    refundedAmount: { type: Number, default: 0 },
    rawWebhookPayloads: { type: [Schema.Types.Mixed], default: [] as unknown[] },
  },
  { timestamps: true }
);

PaymentSchema.index({ orderId: 1 });
PaymentSchema.index({ providerReferenceId: 1 });

export const Payment = model<IPayment>('Payment', PaymentSchema);
