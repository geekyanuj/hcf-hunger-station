import { api } from './apiClient';
import { CartLine, MenuSection, Order, Outlet, OrderType, OrderPaymentMethod, PricedCart } from '@/types/domain';

export const OutletApi = {
  list: async (): Promise<Outlet[]> => (await api.get('/outlets')).data.data,
  getById: async (id: string): Promise<Outlet> => (await api.get(`/outlets/${id}`)).data.data,
};

export const MenuApi = {
  getFullMenu: async (outletId: string): Promise<MenuSection[]> =>
    (await api.get('/menu', { params: { outletId } })).data.data,
  resolveTable: async (qrToken: string) => (await api.get(`/menu/table/${qrToken}`)).data.data,
};

function toCartLinePayload(lines: CartLine[]) {
  return lines.map((l) => ({
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    selectedOptionIds: l.selectedOptionIds,
    notes: l.notes,
  }));
}

export const OrderApi = {
  priceCart: async (outletId: string, orderType: OrderType, lines: CartLine[], couponCode?: string): Promise<PricedCart> =>
    (
      await api.post('/orders/price', {
        outletId,
        orderType,
        lines: toCartLinePayload(lines),
        couponCode: couponCode || undefined,
      })
    ).data.data,

  create: async (payload: {
    outletId: string;
    orderType: OrderType;
    lines: CartLine[];
    tableQrToken?: string;
    paymentMethod?: OrderPaymentMethod;
    couponCode?: string;
    scheduledAt?: string;
    deliveryAddress?: Record<string, unknown>;
    customerNotes?: string;
  }): Promise<Order> =>
    (
      await api.post('/orders', {
        ...payload,
        lines: toCartLinePayload(payload.lines),
        couponCode: payload.couponCode || undefined,
      })
    ).data.data,

  getById: async (id: string): Promise<Order> => (await api.get(`/orders/${id}`)).data.data,

  getStatus: async (id: string) => (await api.get(`/orders/${id}/status`)).data.data,

  /** Customer cancellation — the backend only allows it while the order is PENDING or CONFIRMED. */
  cancel: async (id: string, reason?: string) => (await api.post(`/orders/${id}/cancel`, { reason })).data.data as Order,
};

export const PaymentApi = {
  initiate: async (orderId: string, method: 'CASH' | 'UPI' | 'CARD' | 'ONLINE') =>
    (await api.post('/payments', { orderId, method })).data.data,
};

export const AuthApi = {
  customerLogin: async (payload: {
    name: string;
    mobile: string;
    email?: string;
    address?: { label?: string; line1: string; line2?: string; city: string; state: string; pincode: string };
  }) => (await api.post('/auth/customer/login', payload)).data.data,
  staffLogin: async (email: string, password: string) => (await api.post('/auth/staff/login', { email, password })).data.data,
};

export const CustomerApi = {
  me: async () => (await api.get('/customers/me')).data.data,
  myOrders: async () => (await api.get('/customers/me/orders')).data.data,
};
