import { Schema, model, Document, Types } from 'mongoose';
import { OrderType } from './Order';

export type TokenSeries = 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';

export interface IToken extends Document {
  outletId: Types.ObjectId;
  orderId: Types.ObjectId;
  series: TokenSeries;
  prefix: string; // "T" | "D" | "O"
  sequence: number;
  displayValue: string; // "T-104"
  businessDate: string; // "2026-09-08" - the date this token's daily sequence belongs to
  createdAt: Date;
}

const TokenSchema = new Schema<IToken>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    series: { type: String, enum: ['TAKEAWAY', 'DINE_IN', 'DELIVERY'], required: true },
    prefix: { type: String, required: true },
    sequence: { type: Number, required: true },
    displayValue: { type: String, required: true },
    businessDate: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

TokenSchema.index({ outletId: 1, series: 1, businessDate: 1, sequence: 1 }, { unique: true });

export const Token = model<IToken>('Token', TokenSchema);

export function seriesForOrderType(orderType: OrderType): TokenSeries {
  if (orderType === 'DINE_IN') return 'DINE_IN';
  if (orderType === 'DELIVERY') return 'DELIVERY';
  return 'TAKEAWAY'; // TAKEAWAY and POS-counter-pickup share the takeaway series
}

export const TOKEN_PREFIX: Record<TokenSeries, string> = {
  TAKEAWAY: 'T',
  DINE_IN: 'D',
  DELIVERY: 'O',
};
