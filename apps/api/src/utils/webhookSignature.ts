import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Verifies the mock provider's test webhook against PAYMENT_WEBHOOK_SECRET.
 * Razorpay uses its own exact-raw-body verification in its provider.
 */
export function verifyWebhookSignature(body: unknown, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', env.payment.webhookSecret).update(JSON.stringify(body)).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(signatureHeader, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/** Convenience for the mock provider / test harness to generate a valid signature for a given payload. */
export function signWebhookPayload(body: unknown): string {
  return crypto.createHmac('sha256', env.payment.webhookSecret).update(JSON.stringify(body)).digest('hex');
}
