import { NotificationProvider, NotificationPayload, NotificationTarget } from './NotificationProvider';

/**
 * The in-app channel doesn't need an external target (phone/email) — it
 * writes straight to the Notification collection and pushes over the
 * authenticated Socket.IO connection. This class exists mainly so
 * NotificationService can treat every channel uniformly; the actual
 * persistence + socket push happens in notification.service.ts itself
 * (it needs the principal type/id, which this interface doesn't carry).
 */
export class InAppProvider implements NotificationProvider {
  async send(_target: NotificationTarget, _payload: NotificationPayload) {
    return { success: true };
  }
}
