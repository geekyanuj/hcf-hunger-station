import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CartLine, OrderType } from '@/types/domain';

interface CartState {
  outletId: string | null;
  orderType: OrderType;
  tableQrToken: string | null;
  lines: CartLine[];
  couponCode: string | null;
  setOutlet: (outletId: string) => void;
  setOrderType: (orderType: OrderType) => void;
  setTableQrToken: (token: string | null) => void;
  addLine: (line: CartLine) => void;
  removeLine: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  applyCoupon: (code: string | null) => void;
  clear: () => void;
  itemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      outletId: null,
      orderType: 'DELIVERY',
      tableQrToken: null,
      lines: [],
      couponCode: null,

      setOutlet: (outletId) =>
        set((state) => (state.outletId !== outletId ? { outletId, lines: [] } : { outletId })),

      setOrderType: (orderType) => set({ orderType }),
      setTableQrToken: (tableQrToken) => set({ tableQrToken }),

      addLine: (line) => set((state) => ({ lines: [...state.lines, line] })),

      removeLine: (index) => set((state) => ({ lines: state.lines.filter((_, i) => i !== index) })),

      updateQuantity: (index, quantity) =>
        set((state) => ({
          lines: state.lines.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, quantity) } : l)),
        })),

      applyCoupon: (couponCode) => set({ couponCode }),

      clear: () => set({ lines: [], couponCode: null }),

      itemCount: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
    }),
    { name: 'hfc-cart' }
  )
);
