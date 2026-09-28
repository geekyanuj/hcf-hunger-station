import { OrderService } from './order.service';
import { Outlet } from '../models/Outlet';
import { Payment } from '../models/Payment';
import { ApiError } from '../utils/ApiError';

export interface ReceiptData {
  outletName: string;
  outletAddress: string;
  outletPhone: string;
  orderNumber: string;
  tokenNumber: string;
  orderType: string;
  /** Present for Dine orders. */
  tableNumber?: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod?: string;
  createdAt: string;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number; modifiers: string[] }[];
  subtotal: number;
  discount: number;
  tax: number;
  packagingCharge: number;
  deliveryCharge: number;
  total: number;
  payments: { method: string; amount: number; status: string }[];
  amountPaid: number;
  balanceDue: number;
}

/**
 * Produces the structured data a receipt needs. This is the "printable
 * receipt architecture" required by the spec: rather than hard-coding a
 * printer/ESC-POS integration (which needs real hardware to test), the API
 * returns clean structured data that any renderer — the POS's browser-print
 * view (see apps/web POS Receipt component), a thermal printer driver, or a
 * PDF export — can consume without re-deriving totals.
 */
export const ReceiptService = {
  async build(orderId: string): Promise<ReceiptData> {
    const order = await OrderService.getById(orderId);
    const outlet = await Outlet.findById(order.outletId);
    if (!outlet) throw ApiError.notFound('Outlet not found for this order');

    const payments = await Payment.find({ orderId: order._id }).sort({ createdAt: 1 });
    const amountPaid = payments.filter((p) => p.status === 'SUCCESS').reduce((sum, p) => sum + p.amount, 0);

    return {
      outletName: outlet.name,
      outletAddress: outlet.address,
      outletPhone: outlet.phone,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        modifiers: i.selectedModifiers.map((m) => `${m.modifierName}: ${m.optionName}`),
      })),
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      packagingCharge: order.packagingCharge,
      deliveryCharge: order.deliveryCharge,
      total: order.total,
      payments: payments.map((p) => ({ method: p.method, amount: p.amount, status: p.status })),
      amountPaid,
      balanceDue: Math.max(0, order.total - amountPaid),
    };
  },
};
