import { Payment } from '../models/Payment';
import { Order, IOrder, PaymentStatus } from '../models/Order';
import { ApiError } from '../utils/ApiError';
import { PaymentProvider } from './payment/PaymentProvider';
import { MockPaymentProvider } from './payment/MockPaymentProvider';
import { env } from '../config/env';
import { emitPaymentUpdated } from '../sockets';
import { round2 } from '../utils/format';
import { AuditService, AuditContext } from './audit.service';
import { canTransitionPaymentStatus, isRefundState } from './paymentStateMachine';
import { OrderActor } from './orderStateMachine';
import { logger } from '../config/logger';

function resolveProvider(): PaymentProvider {
  switch (env.payment.provider) {
    case 'MOCK':
    default:
      return new MockPaymentProvider();
  }
}

const provider = resolveProvider();

/** Sum of all SUCCESS payments recorded against an order so far. */
async function totalPaid(orderId: string): Promise<number> {
  const successful = await Payment.find({ orderId, status: 'SUCCESS' });
  return round2(successful.reduce((sum, p) => sum + p.amount, 0));
}

/**
 * Applies a payment-status change through the payment state machine with a
 * conditional atomic write. This NEVER touches orderStatus — payment and
 * order lifecycles are independent (e.g. Pay After Dine In: order COMPLETED,
 * payment still PENDING until staff records it).
 */
async function applyPaymentStatus(order: IOrder, next: PaymentStatus): Promise<IOrder> {
  if (order.paymentStatus === next) return order;
  if (!canTransitionPaymentStatus(order.paymentStatus, next)) {
    logger.warn(`Ignored invalid payment transition ${order.paymentStatus} → ${next} for order ${order.orderNumber}`);
    return order;
  }
  const updated = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: order.paymentStatus }, { $set: { paymentStatus: next } }, { new: true });
  if (!updated) {
    // Lost a race with another payment/webhook; return the latest committed state instead of clobbering it.
    return (await Order.findById(order._id)) ?? order;
  }
  emitPaymentSafely(updated);
  return updated;
}

/** Recomputes an order's paymentStatus from its actual payment records — never trusts a caller-supplied status. */
async function recomputePaymentStatus(orderId: string): Promise<IOrder | null> {
  const order = await Order.findById(orderId);
  if (!order) return null;
  if (isRefundState(order.paymentStatus)) return order; // a late/duplicate payment event must not overwrite a refund
  const paid = await totalPaid(orderId);
  const next: PaymentStatus = paid <= 0 ? 'PENDING' : paid >= order.total ? 'PAID' : 'PARTIALLY_PAID';
  return applyPaymentStatus(order, next);
}

export const PaymentService = {
  /**
   * Initiates one payment towards an order. Supports split payments: the POS
   * can call this multiple times with different methods/amounts (e.g. ₹200
   * cash + ₹150 UPI) — paymentStatus is always recomputed from the sum of
   * SUCCESS payment records, not overwritten by a single call.
   */
  async initiate(orderId: string, method: 'CASH' | 'UPI' | 'CARD' | 'ONLINE', amount?: number, actor?: OrderActor) {
    const order = await Order.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found');
    if (order.orderStatus === 'CANCELLED') throw ApiError.conflict('Cannot take payment for a cancelled order');
    if (order.paymentStatus === 'PAID') throw ApiError.conflict('Order is already fully paid');
    if (isRefundState(order.paymentStatus)) throw ApiError.conflict('This order has already been refunded');
    // Pay After Dine In: the guest settles after the meal and STAFF record it — a customer/guest must not mark it paid.
    if (order.paymentMethod === 'PAY_AFTER_DINE_IN' && !(actor?.type === 'STAFF' && actor.permissions.includes('payments.process'))) {
      throw ApiError.forbidden('Pay After Dine In payments are recorded by staff after the meal');
    }

    const alreadyPaid = await totalPaid(orderId);
    const remaining = round2(order.total - alreadyPaid);
    const requestedAmount = amount && amount > 0 ? round2(Math.min(amount, remaining)) : remaining;
    if (requestedAmount <= 0) throw ApiError.conflict('Order is already fully paid');

    const result = await provider.createPayment({ orderId, amount: requestedAmount, method });

    const payment = await Payment.create({
      orderId: order._id,
      outletId: order.outletId,
      amount: requestedAmount,
      method,
      provider: env.payment.provider,
      providerReferenceId: result.providerReferenceId,
      status: result.status,
    });

    if (result.status === 'SUCCESS') {
      await recomputePaymentStatus(orderId);
    }

    return { payment, redirectUrl: result.redirectUrl, remainingAfterThis: round2(remaining - (result.status === 'SUCCESS' ? requestedAmount : 0)) };
  },

  /**
   * Server-side webhook handler - the only source of truth for non-cash
   * payment confirmation. Never trust a client-reported "payment successful".
   */
  async handleWebhook(rawBody: unknown, signature?: string) {
    const result = await provider.handleWebhook(rawBody, signature);
    const payment = await Payment.findOneAndUpdate(
      { providerReferenceId: result.providerReferenceId },
      { status: result.status, $push: { rawWebhookPayloads: rawBody as Record<string, unknown> } },
      { new: true }
    );
    if (!payment) throw ApiError.notFound('Payment reference not found');

    if (result.status === 'SUCCESS') {
      await recomputePaymentStatus(payment.orderId.toString());
    } else {
      const order = await Order.findById(payment.orderId);
      if (order && order.paymentStatus === 'PENDING') await applyPaymentStatus(order, 'FAILED');
    }
    return payment;
  },

  /**
   * Refunds money WITHOUT touching orderStatus: a COMPLETED order stays
   * COMPLETED and only paymentStatus moves (PAID → PARTIALLY_REFUNDED →
   * REFUNDED). The refund itself is recorded on the Payment documents and
   * in the audit log.
   */
  async refund(orderId: string, amount: number, ctx: AuditContext) {
    const order = await Order.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found');
    if (!(amount > 0)) throw ApiError.badRequest('Refund amount must be greater than zero');
    if (!['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) {
      throw ApiError.badRequest(`Nothing to refund: payment status is ${order.paymentStatus}`);
    }

    const payments = await Payment.find({ orderId: order._id, status: { $in: ['SUCCESS', 'REFUNDED'] } }).sort({ createdAt: -1 });
    const collected = round2(payments.reduce((sum, p) => sum + p.amount, 0));
    const alreadyRefunded = round2(payments.reduce((sum, p) => sum + p.refundedAmount, 0));
    const refundable = round2(collected - alreadyRefunded);
    if (amount > refundable) throw ApiError.badRequest(`Refund amount exceeds the refundable balance (${refundable})`);

    // Allocate the refund across payments, newest first (split payments are supported).
    let remaining = round2(amount);
    let refundedNow = 0;
    let lastPaymentId: string | undefined;
    for (const payment of payments) {
      if (remaining <= 0) break;
      const room = round2(payment.amount - payment.refundedAmount);
      if (room <= 0 || payment.status !== 'SUCCESS') continue;
      const portion = round2(Math.min(room, remaining));
      if (payment.providerReferenceId) {
        const result = await provider.refundPayment({ providerReferenceId: payment.providerReferenceId, amount: portion });
        if (result.status !== 'REFUNDED') break; // provider refused — stop and report what was actually refunded
      }
      payment.refundedAmount = round2(payment.refundedAmount + portion);
      if (payment.refundedAmount >= payment.amount) payment.status = 'REFUNDED';
      await payment.save();
      remaining = round2(remaining - portion);
      refundedNow = round2(refundedNow + portion);
      lastPaymentId = payment.id;
    }

    if (refundedNow <= 0) throw ApiError.badRequest('The payment provider could not process this refund');

    const nextStatus: PaymentStatus = round2(alreadyRefunded + refundedNow) >= collected ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    const updatedOrder = await applyPaymentStatus(order, nextStatus);

    await AuditService.record({
      ctx,
      action: 'REFUND',
      entity: 'Order',
      entityId: order.id,
      outletId: order.outletId.toString(),
      after: { amount: refundedNow, requested: amount, paymentId: lastPaymentId, paymentStatus: updatedOrder.paymentStatus, orderStatus: order.orderStatus },
    });

    if (refundedNow < amount) {
      throw ApiError.badRequest(`Refund partially processed: ${refundedNow} of ${amount} refunded before the provider refused the rest`);
    }
    return Payment.find({ orderId: order._id }).sort({ createdAt: 1 });
  },

  async listForOrder(orderId: string) {
    return Payment.find({ orderId }).sort({ createdAt: 1 });
  },
};

function emitPaymentSafely(order: IOrder) {
  try {
    emitPaymentUpdated(order);
  } catch (err) {
    logger.warn(`PAYMENT_UPDATED emit failed for ${order.orderNumber}: ${(err as Error).message}`);
  }
}
