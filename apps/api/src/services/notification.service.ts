import { Types } from 'mongoose';
import { Notification, NotificationChannel, NotificationType, NotificationPrincipalType } from '../models/Notification';
import { PushProvider, WhatsAppProvider, SMSProvider } from './notification/PlaceholderProviders';
import { getIO } from '../sockets';
import { logger } from '../config/logger';

const pushProvider = new PushProvider();
const whatsAppProvider = new WhatsAppProvider();
const smsProvider = new SMSProvider();

export interface SendNotificationInput {
  principalType: NotificationPrincipalType;
  principalId: string | Types.ObjectId;
  outletId?: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[]; // defaults to [IN_APP, SOCKET]
  target?: { phone?: string; email?: string; pushToken?: string };
}

export const NotificationService = {
  async send(input: SendNotificationInput) {
    const channels = input.channels ?? ['IN_APP', 'SOCKET'];

    const notification = await Notification.create({
      principalType: input.principalType,
      principalId: input.principalId,
      outletId: input.outletId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data,
      channels,
    });

    if (channels.includes('SOCKET')) {
      try {
        const room = input.principalType === 'USER' ? `user:${input.principalId}` : `customer:${input.principalId}`;
        getIO().to(room).emit('notification:new', {
          id: notification.id,
          type: input.type,
          title: input.title,
          message: input.message,
          data: input.data,
          createdAt: notification.createdAt,
        });
      } catch {
        // socket layer unavailable - in-app record still persisted, non-fatal
      }
    }

    if (channels.includes('PUSH')) {
      pushProvider.send({ pushToken: input.target?.pushToken }, { title: input.title, message: input.message }).catch((e) => logger.warn(String(e)));
    }
    if (channels.includes('WHATSAPP')) {
      whatsAppProvider.send({ phone: input.target?.phone }, { title: input.title, message: input.message }).catch((e) => logger.warn(String(e)));
    }
    if (channels.includes('SMS')) {
      smsProvider.send({ phone: input.target?.phone }, { title: input.title, message: input.message }).catch((e) => logger.warn(String(e)));
    }

    return notification;
  },

  async listForPrincipal(principalType: NotificationPrincipalType, principalId: string, page: number, limit: number) {
    const query = { principalType, principalId };
    const [items, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(query),
      Notification.countDocuments({ ...query, isRead: false }),
    ]);
    return { items, total, unreadCount };
  },

  async markRead(id: string, principalId: string) {
    await Notification.updateOne({ _id: id, principalId }, { isRead: true });
  },

  async markAllRead(principalType: NotificationPrincipalType, principalId: string) {
    await Notification.updateMany({ principalType, principalId, isRead: false }, { isRead: true });
  },
};
