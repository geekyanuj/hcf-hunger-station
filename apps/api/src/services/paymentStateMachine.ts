/**
 * PAYMENT status state machine — deliberately separate from the order status
 * machine. An order can be COMPLETED with payment still PENDING (Pay After
 * Dine In) or COMPLETED with payment REFUNDED; the payment lifecycle never
 * changes orderStatus and vice-versa.
 *
 *   PENDING → PAID                     (cash/UPI recorded, or staff records payment after the meal)
 *   PENDING → PARTIALLY_PAID → PAID    (split payments)
 *   PENDING → FAILED → PENDING/PAID    (gateway failure, then retry)
 *   PAID / PARTIALLY_PAID → PARTIALLY_REFUNDED → REFUNDED
 *   PAID → REFUNDED
 *
 * AUTHORIZED is kept for gateways with a separate authorise/capture step.
 */
import { PaymentStatus } from '../models/Order';

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  PENDING: ['AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'FAILED'],
  AUTHORIZED: ['PARTIALLY_PAID', 'PAID', 'FAILED'],
  PARTIALLY_PAID: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  PAID: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: ['PENDING', 'PARTIALLY_PAID', 'PAID'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  REFUNDED: [],
};

export function canTransitionPaymentStatus(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true; // idempotent re-apply (e.g. repeated webhook) is a no-op, not an error
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** Once any money has been refunded, further inbound payments must not silently overwrite the refund state. */
export function isRefundState(status: PaymentStatus): boolean {
  return status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED';
}
