import { api } from './apiClient';

export const StaffAuthApi = {
  login: async (email: string, password: string) => (await api.post('/auth/staff/login', { email, password })).data.data,
};

// ---------- Orders / POS / Payments ----------
export const StaffOrderApi = {
  create: async (payload: Record<string, unknown>): Promise<import('@/types/domain').Order> => (await api.post('/orders', payload)).data.data,
  priceCart: async (payload: Record<string, unknown>) => (await api.post('/orders/price', payload)).data.data,
  list: async (outletId: string, params: Record<string, unknown> = {}) =>
    (await api.get('/orders', { params: { outletId, ...params } })).data,
  getById: async (id: string) => (await api.get(`/orders/${id}`)).data.data,
  /** "Current Orders" feed: active orders (+ recently closed) with per-status counters and role-aware `availableActions`. */
  current: async (outletId: string, params: { includeClosed?: boolean; orderType?: string } = {}) =>
    (await api.get('/orders/current', { params: { outletId, ...params } })).data.data as { orders: import('@/types/domain').Order[]; counts: Record<string, number> },
  /**
   * `expectedStatus` is the status the user was looking at; if someone else changed the order in the
   * meantime the API answers 409 "Order status has already been updated." instead of applying a stale click.
   */
  updateStatus: async (id: string, status: string, opts: { note?: string; reason?: string; expectedStatus?: string } = {}) =>
    (await api.patch(`/orders/${id}/status`, { status, ...opts })).data.data,
  cancel: async (id: string, opts: { reason?: string; note?: string; expectedStatus?: string } = {}) =>
    (await api.post(`/orders/${id}/cancel`, opts)).data.data,
  receipt: async (id: string) => (await api.get(`/orders/${id}/receipt`)).data.data,
};

export const StaffPaymentApi = {
  initiate: async (orderId: string, method: string, amount?: number) =>
    (await api.post('/payments', { orderId, method, amount })).data.data,
  listForOrder: async (orderId: string) => (await api.get(`/payments/order/${orderId}`)).data.data,
  refund: async (orderId: string, amount: number) => (await api.post('/payments/refund', { orderId, amount })).data.data,
};

// ---------- Kitchen (KDS) ----------
export const KitchenApi = {
  board: async (outletId: string) => (await api.get('/kitchen/board', { params: { outletId } })).data.data,
  workload: async (outletId: string) => (await api.get('/kitchen/workload', { params: { outletId } })).data.data,
};

// ---------- Inventory ----------
export const InventoryApi = {
  list: async (outletId: string, params: Record<string, unknown> = {}) =>
    (await api.get('/inventory', { params: { outletId, ...params } })).data,
  getById: async (id: string) => (await api.get(`/inventory/${id}`)).data.data,
  create: async (payload: Record<string, unknown>) => (await api.post('/inventory', payload)).data.data,
  update: async (id: string, payload: Record<string, unknown>) => (await api.patch(`/inventory/${id}`, payload)).data.data,
  remove: async (id: string) => (await api.delete(`/inventory/${id}`)).data,
  adjustStock: async (id: string, outletId: string, delta: number, notes?: string) =>
    (await api.post(`/inventory/${id}/adjust`, { outletId, delta, notes })).data.data,
  ledgerForOutlet: async (outletId: string, params: Record<string, unknown> = {}) =>
    (await api.get('/inventory/ledger', { params: { outletId, ...params } })).data,
};

export const RecipeApi = {
  list: async (outletId: string) => (await api.get('/recipes', { params: { outletId } })).data.data,
  getForMenuItem: async (outletId: string, menuItemId: string) =>
    (await api.get(`/recipes/${menuItemId}`, { params: { outletId } })).data.data,
  cost: async (outletId: string, menuItemId: string) => (await api.get(`/recipes/${menuItemId}/cost`, { params: { outletId } })).data.data,
  upsert: async (payload: Record<string, unknown>) => (await api.post('/recipes', payload)).data.data,
  remove: async (outletId: string, menuItemId: string) => (await api.delete(`/recipes/${menuItemId}`, { params: { outletId } })).data,
};

export const SupplierApi = {
  list: async (outletId: string) => (await api.get('/suppliers', { params: { outletId } })).data.data,
  create: async (payload: Record<string, unknown>) => (await api.post('/suppliers', payload)).data.data,
  update: async (id: string, payload: Record<string, unknown>) => (await api.patch(`/suppliers/${id}`, payload)).data.data,
  remove: async (id: string) => (await api.delete(`/suppliers/${id}`)).data,
};

export const PurchaseApi = {
  list: async (outletId: string, params: Record<string, unknown> = {}) =>
    (await api.get('/purchases', { params: { outletId, ...params } })).data,
  getById: async (id: string) => (await api.get(`/purchases/${id}`)).data.data,
  create: async (payload: Record<string, unknown>) => (await api.post('/purchases', payload)).data.data,
  complete: async (id: string) => (await api.post(`/purchases/${id}/complete`)).data.data,
  cancel: async (id: string) => (await api.post(`/purchases/${id}/cancel`)).data.data,
};

export const WastageApi = {
  list: async (outletId: string, params: Record<string, unknown> = {}) =>
    (await api.get('/wastage', { params: { outletId, ...params } })).data,
  create: async (payload: Record<string, unknown>) => (await api.post('/wastage', payload)).data.data,
};

export const InventoryDashboardApi = {
  summary: async (outletId: string) => (await api.get('/inventory-dashboard/summary', { params: { outletId } })).data.data,
};

export const AuditApi = {
  list: async (params: Record<string, unknown> = {}) => (await api.get('/audit-logs', { params })).data,
};

export const MenuAdminApi = {
  listCategories: async (outletId: string) => (await api.get('/menu/categories', { params: { outletId } })).data.data,
  listItems: async (outletId: string) => (await api.get('/menu/items', { params: { outletId } })).data.data,
  createCategory: async (payload: Record<string, unknown>) => (await api.post('/menu/categories', payload)).data.data,
  createItem: async (payload: Record<string, unknown>) => (await api.post('/menu/items', payload)).data.data,
  updateItem: async (id: string, payload: Record<string, unknown>) => (await api.patch(`/menu/items/${id}`, payload)).data.data,
  setAvailability: async (id: string, isAvailable: boolean) =>
    (await api.patch(`/menu/items/${id}/availability`, { isAvailable })).data.data,
  uploadImage: async (file: File): Promise<{ url: string }> => {
    // Let the browser/axios set the multipart Content-Type (with boundary) itself.
    const formData = new FormData();
    formData.append('image', file);
    return (await api.post('/menu/items/upload-image', formData)).data.data;
  },
};

// ---------- Part 3 ----------

export const DashboardApi = {
  overview: async (outletId: string) => (await api.get('/dashboard/overview', { params: { outletId } })).data.data,
  /** Owner-only. Re-enters the owner's password; the dashboard then counts from this moment (no data is deleted). */
  reset: async (outletId: string, password: string): Promise<{ resetAt: string; resetBy: string; outletCount: number }> =>
    (await api.post('/dashboard/reset', { password }, { params: { outletId } })).data.data,
};

// ---------- Browser token printing ----------
export interface PrintStatus {
  driver: 'DISABLED' | 'NETWORK' | 'FILE' | 'CONSOLE';
  configured: boolean;
  /** Direct printing is paused; previews always use the browser. */
  mode: 'PRINTER' | 'BROWSER';
  target: string;
  paperWidthMm: 58 | 80;
  charactersPerLine: number;
  autoCut: boolean;
  openDrawer: boolean;
  defaultCopies: number;
  hint?: string;
}

export interface PrintResult {
  printed: boolean;
  mode: 'PRINTER' | 'BROWSER';
  driver: string;
  copies: number;
  isReprint: boolean;
  jobId: string;
  text: string;
  paperWidthMm: 58 | 80;
  warning?: string;
}

export interface PrintJob {
  _id: string;
  tokenNumber?: string;
  type: 'TOKEN' | 'TEST';
  status: 'PRINTED' | 'BROWSER' | 'FAILED';
  driver: string;
  copies: number;
  isReprint: boolean;
  error?: string;
  createdAt: string;
  requestedBy?: { name: string; role: string };
}

export const PrintApi = {
  status: async (): Promise<PrintStatus> => (await api.get('/print/status')).data.data,
  printToken: async (orderId: string, copies?: number): Promise<PrintResult> =>
    (await api.post(`/print/orders/${orderId}/token`, copies ? { copies } : {})).data.data,
  previewToken: async (orderId: string): Promise<{ text: string; paperWidthMm: 58 | 80 }> =>
    (await api.get(`/print/orders/${orderId}/token/preview`)).data.data,
  test: async (outletId: string): Promise<PrintResult> => (await api.post('/print/test', { outletId })).data.data,
  jobs: async (outletId: string, limit = 20): Promise<PrintJob[]> => (await api.get('/print/jobs', { params: { outletId, limit } })).data.data,
};

export const AnalyticsApi = {
  revenueOverTime: async (params: Record<string, unknown>) => (await api.get('/analytics/revenue-over-time', { params })).data.data,
  orderTypeDistribution: async (params: Record<string, unknown>) => (await api.get('/analytics/order-type-distribution', { params })).data.data,
  topProducts: async (params: Record<string, unknown>) => (await api.get('/analytics/top-products', { params })).data.data,
  categoryPerformance: async (params: Record<string, unknown>) => (await api.get('/analytics/category-performance', { params })).data.data,
  paymentMethods: async (params: Record<string, unknown>) => (await api.get('/analytics/payment-methods', { params })).data.data,
  purchaseTrend: async (params: Record<string, unknown>) => (await api.get('/analytics/purchase-trend', { params })).data.data,
  wastageTrend: async (params: Record<string, unknown>) => (await api.get('/analytics/wastage-trend', { params })).data.data,
  foodCost: async (params: Record<string, unknown>) => (await api.get('/analytics/food-cost', { params })).data.data,
  outletPerformance: async (params: Record<string, unknown>) => (await api.get('/analytics/outlet-performance', { params })).data.data,
  staffPerformance: async (params: Record<string, unknown>) => (await api.get('/analytics/staff-performance', { params })).data.data,
};

export const CouponApi = {
  list: async () => (await api.get('/coupons')).data.data,
  create: async (payload: Record<string, unknown>) => (await api.post('/coupons', payload)).data.data,
  update: async (id: string, payload: Record<string, unknown>) => (await api.patch(`/coupons/${id}`, payload)).data.data,
  remove: async (id: string) => (await api.delete(`/coupons/${id}`)).data,
};

export const LoyaltyApi = {
  getConfig: async (outletId?: string) => (await api.get('/loyalty/config', { params: outletId ? { outletId } : {} })).data.data,
  upsertConfig: async (payload: Record<string, unknown>) => (await api.post('/loyalty/config', payload)).data.data,
  myBalance: async () => (await api.get('/loyalty/me')).data.data,
  myHistory: async () => (await api.get('/loyalty/me/history')).data,
  previewRedeem: async (outletId: string, orderTotal: number, pointsRequested: number) =>
    (await api.post('/loyalty/me/preview-redeem', { outletId, orderTotal, pointsRequested })).data.data,
  adjust: async (customerId: string, points: number, notes: string) =>
    (await api.post('/loyalty/adjust', { customerId, points, notes })).data.data,
};

export const PartyOrderApi = {
  submit: async (payload: Record<string, unknown>) => (await api.post('/party-orders', payload)).data.data,
  list: async (outletId: string, status?: string) => (await api.get('/party-orders', { params: { outletId, status } })).data.data,
  getById: async (id: string) => (await api.get(`/party-orders/${id}`)).data.data,
  markContacted: async (id: string) => (await api.post(`/party-orders/${id}/contacted`)).data.data,
  addQuotation: async (id: string, payload: Record<string, unknown>) => (await api.post(`/party-orders/${id}/quotation`, payload)).data.data,
  approve: async (id: string) => (await api.post(`/party-orders/${id}/approve`)).data.data,
  reject: async (id: string, reason: string) => (await api.post(`/party-orders/${id}/reject`, { reason })).data.data,
  convert: async (id: string, payload: Record<string, unknown>) => (await api.post(`/party-orders/${id}/convert`, payload)).data.data,
};

export const DeliveryApi = {
  unassigned: async (outletId: string) => (await api.get('/delivery/unassigned', { params: { outletId } })).data.data,
  executives: async (outletId: string) => (await api.get('/delivery/executives', { params: { outletId } })).data.data as { _id: string; name: string }[],
  /** Parcel orders with a delivery executive that are still in flight (READY-assigned / OUT_FOR_DELIVERY). */
  inFlight: async (outletId: string) => (await api.get('/delivery/in-flight', { params: { outletId } })).data.data,
  assign: async (orderId: string, deliveryStaffId: string) => (await api.post(`/delivery/${orderId}/assign`, { deliveryStaffId })).data.data,
  pickedUp: async (orderId: string) => (await api.post(`/delivery/${orderId}/picked-up`)).data.data,
  myOrders: async () => (await api.get('/delivery/my-orders')).data.data,
};

export const NotificationApi = {
  list: async () => (await api.get('/notifications')).data.data,
  markRead: async (id: string) => (await api.post(`/notifications/${id}/read`)).data,
  markAllRead: async () => (await api.post('/notifications/mark-all-read')).data,
};

export const SearchApi = {
  search: async (q: string, outletId?: string) => (await api.get('/search', { params: { q, outletId } })).data.data,
};

export const ExportApi = {
  download: async (path: string, outletId: string, filename: string) => {
    const response = await api.get(path, { params: { outletId }, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export const TableAdminApi = {
  list: async (outletId: string) => (await api.get('/tables', { params: { outletId } })).data.data,
  create: async (payload: Record<string, unknown>) => (await api.post('/tables', payload)).data.data,
  update: async (id: string, payload: Record<string, unknown>) => (await api.patch(`/tables/${id}`, payload)).data.data,
  regenerateQr: async (id: string) => (await api.patch(`/tables/${id}/regenerate-qr`)).data.data,
  remove: async (id: string) => (await api.delete(`/tables/${id}`)).data,
};

export const StaffAdminApi = {
  list: async (outletId?: string) => (await api.get('/users', { params: outletId ? { outletId } : {} })).data.data,
  create: async (payload: Record<string, unknown>) => (await api.post('/users', payload)).data.data,
  update: async (id: string, payload: Record<string, unknown>) => (await api.patch(`/users/${id}`, payload)).data.data,
  remove: async (id: string) => (await api.delete(`/users/${id}`)).data,
  resetPassword: async (id: string, newPassword: string) => (await api.post(`/users/${id}/reset-password`, { newPassword })).data,
};

export const OutletAdminApi = {
  update: async (id: string, payload: Record<string, unknown>) => (await api.patch(`/outlets/${id}`, payload)).data.data,
  create: async (payload: Record<string, unknown>) => (await api.post('/outlets', payload)).data.data,
};
