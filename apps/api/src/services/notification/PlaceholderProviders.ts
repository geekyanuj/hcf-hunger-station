import { NotificationProvider, NotificationPayload, NotificationTarget } from './NotificationProvider';
import { logger } from '../../config/logger';

/**
 * These three providers implement the same architecture as the real
 * in-app/socket channel but log to the server console instead of calling a
 * paid third-party API (Firebase/APNs for push, the WhatsApp Business API,
 * or an SMS gateway like Twilio/MSG91) — exactly the same pattern already
 * used for OTP delivery and password-reset emails in Parts 1-2. Swapping
 * in a real provider is a one-file change: implement NotificationProvider
 * and register it in notification.service.ts's provider map.
 */
export class PushProvider implements NotificationProvider {
  async send(target: NotificationTarget, payload: NotificationPayload) {
    if (!target.pushToken) return { success: false };
    logger.info(`[PUSH placeholder] to=${target.pushToken} title="${payload.title}" message="${payload.message}"`);
    return { success: true, providerRef: `push_${Date.now()}` };
  }
}

export class WhatsAppProvider implements NotificationProvider {
  async send(target: NotificationTarget, payload: NotificationPayload) {
    if (!target.phone) return { success: false };
    logger.info(`[WHATSAPP placeholder] to=${target.phone} message="${payload.title}: ${payload.message}"`);
    return { success: true, providerRef: `wa_${Date.now()}` };
  }
}

export class SMSProvider implements NotificationProvider {
  async send(target: NotificationTarget, payload: NotificationPayload) {
    if (!target.phone) return { success: false };
    logger.info(`[SMS placeholder] to=${target.phone} message="${payload.title}: ${payload.message}"`);
    return { success: true, providerRef: `sms_${Date.now()}` };
  }
}
