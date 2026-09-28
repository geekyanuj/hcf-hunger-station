export interface NotificationPayload {
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface NotificationTarget {
  /** Mobile number (customer) or nothing (staff push/whatsapp not wired to a number in Part 3). */
  phone?: string;
  email?: string;
  /** Push notification device token, if one has been registered (architecture placeholder — no device registration flow exists yet). */
  pushToken?: string;
}

/**
 * Every outbound notification channel implements this interface so
 * NotificationService never depends on a specific vendor's SDK. Part 3 ships
 * a working InAppProvider (writes a Notification document + Socket.IO push)
 * and console-logging placeholders for Push/WhatsApp/SMS — swapping in
 * Firebase Cloud Messaging, the WhatsApp Business API, or an SMS gateway
 * means implementing this interface once and registering it in
 * notification.service.ts's provider map.
 */
export interface NotificationProvider {
  send(target: NotificationTarget, payload: NotificationPayload): Promise<{ success: boolean; providerRef?: string }>;
}
