import { Schema, model, Document, Types } from 'mongoose';

export type NotificationPrincipalType = 'USER' | 'CUSTOMER';

export type NotificationType =
  | 'ORDER_CONFIRMED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILURE'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'ORDER_DISPATCHED'
  | 'ORDER_DELIVERED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLED'
  | 'SCHEDULED_ORDER_REMINDER'
  | 'COUPON'
  | 'LOYALTY'
  | 'NEW_ONLINE_ORDER'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'DELAYED_ORDER'
  | 'CRITICAL_INVENTORY'
  | 'PARTY_REQUEST';

export type NotificationChannel = 'IN_APP' | 'SOCKET' | 'PUSH' | 'WHATSAPP' | 'SMS';

export interface INotification extends Document {
  principalType: NotificationPrincipalType;
  principalId: Types.ObjectId;
  outletId?: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels: NotificationChannel[]; // which channels this notification was (attempted to be) delivered through
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    principalType: { type: String, enum: ['USER', 'CUSTOMER'], required: true },
    principalId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet' },
    type: {
      type: String,
      enum: [
        'ORDER_CONFIRMED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILURE', 'ORDER_PREPARING', 'ORDER_READY',
        'ORDER_DISPATCHED', 'ORDER_DELIVERED', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'SCHEDULED_ORDER_REMINDER', 'COUPON', 'LOYALTY',
        'NEW_ONLINE_ORDER', 'LOW_STOCK', 'OUT_OF_STOCK', 'DELAYED_ORDER', 'CRITICAL_INVENTORY', 'PARTY_REQUEST',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    channels: [{ type: String, enum: ['IN_APP', 'SOCKET', 'PUSH', 'WHATSAPP', 'SMS'] }],
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ principalType: 1, principalId: 1, createdAt: -1 });
NotificationSchema.index({ principalType: 1, principalId: 1, isRead: 1 });

export const Notification = model<INotification>('Notification', NotificationSchema);
