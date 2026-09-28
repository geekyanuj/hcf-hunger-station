/**
 * Presentation helpers for the order lifecycle. This file only decides HOW
 * statuses are worded and coloured — WHAT a user may do with an order comes
 * from the backend (`order.availableActions`, computed by the state machine),
 * never from here.
 */
import { DeliveryStatus, Order, OrderStatus, OrderType, PaymentStatus } from '@/types/domain';

export type OrderFlow = 'PARCEL' | 'TAKE' | 'DINE';

export function flowFor(orderType: OrderType): OrderFlow {
  if (orderType === 'DELIVERY') return 'PARCEL';
  if (orderType === 'DINE_IN') return 'DINE';
  return 'TAKE'; // TAKEAWAY, POS (counter), CATERING are handed over in person
}

/** Business vocabulary for order types. */
export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DELIVERY: 'Parcel',
  TAKEAWAY: 'Take',
  DINE_IN: 'Dine',
  POS: 'Counter',
  CATERING: 'Catering',
};

/** Customer-facing wording — never expose enum names like PREPARING. */
export function customerStatusLabel(status: OrderStatus, orderType: OrderType): string {
  switch (status) {
    case 'PENDING':
      return 'Order Received';
    case 'CONFIRMED':
      return 'Order Confirmed';
    case 'PREPARING':
      return 'Preparing Your Order';
    case 'READY': {
      const flow = flowFor(orderType);
      if (flow === 'PARCEL') return 'Ready for Delivery';
      if (flow === 'DINE') return 'Your Food Is Ready';
      return 'Ready for Pickup';
    }
    case 'OUT_FOR_DELIVERY':
      return 'Out for Delivery';
    case 'COMPLETED':
      return 'Order Completed';
    case 'CANCELLED':
      return 'Order Cancelled';
  }
}

/** Staff dashboard badge labels. */
export const DASHBOARD_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PREPARING: 'bg-orange-100 text-orange-700',
  READY: 'bg-emerald-100 text-emerald-700',
  OUT_FOR_DELIVERY: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-neutral-200 text-neutral-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Payment Pending',
  AUTHORIZED: 'Authorised',
  PARTIALLY_PAID: 'Partly Paid',
  PAID: 'Paid',
  FAILED: 'Payment Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly Refunded',
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDING: 'Awaiting assignment',
  ASSIGNED: 'Executive assigned',
  PICKED_UP: 'Picked up',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** Timeline shown to the customer for the happy path of each flow. */
export function customerTimelineSteps(orderType: OrderType): OrderStatus[] {
  return flowFor(orderType) === 'PARCEL'
    ? ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
    : ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];
}

export function tableLabel(order: Pick<Order, 'tableNumber'>): string | null {
  return order.tableNumber ? `Table ${order.tableNumber}` : null;
}
