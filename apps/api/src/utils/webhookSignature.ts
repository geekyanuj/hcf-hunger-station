import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Verifies a payment webhook's HMAC-SHA256 signature against the shared
 * secret (PAYMENT_WEBHOOK_SECRET). Computed over the JSON-stringified parsed
 * body rather than the raw request bytes — this project uses express.json()
 * globally, so exact raw-byte verification (the gold standard for gateways
 * like Razorpay/Stripe) would require carving out a raw-body exception for
 * this one route. Documented as a scoped limitation in docs/SECURITY.md;
 * a production integration with a real gateway should switch this route to
 * `express.raw({ type: 'application/json' })` and verify against the exact
 * bytes the gateway signed.
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
