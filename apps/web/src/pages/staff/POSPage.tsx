import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Trash2, Minus, Plus, Printer, Ban, Percent, UtensilsCrossed } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { MenuApi } from '@/services/domainApi';
import { StaffOrderApi, StaffPaymentApi, TableAdminApi } from '@/services/staffApi';
import { Card, CardContent, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils/cn';
import { cn } from '@/utils/cn';
import { CartLine, Order, OrderType } from '@/types/domain';
import { ORDER_TYPE_LABEL } from '@/utils/orderStatus';
import { useSessionStore } from '@/stores/session.store';
import { printKitchenToken } from '@/utils/printOrder';

const ORDER_TYPES: { value: OrderType; label: string }[] = (['POS', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'] as OrderType[]).map((value) => ({
  value,
  label: ORDER_TYPE_LABEL[value],
}));

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'ONLINE'] as const;

export default function POSPage() {
  const { activeOutletId } = useStaffOutletStore();
  const { push } = useToast();
  const queryClient = useQueryClient();

  const [orderType, setOrderType] = useState<OrderType>('POS');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableId, setTableId] = useState('');
  const [address, setAddress] = useState({ line1: '', city: '', pincode: '' });
  const [kitchenComment, setKitchenComment] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);

  // Kitchen-token printing is browser-only: OWNER, MANAGER and CASHIER only.
  const canPrintKitchenToken = useSessionStore((st) => st.hasPermission('tokens.print'));
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [printing, setPrinting] = useState(false);

  function printKitchenTokenForOrder(target: Order) {
    setPrinting(true);
    try {
      printKitchenToken(target);
      push(`Kitchen token ${target.tokenNumber} opened in browser print preview`, 'success');
    } catch (err) {
      push(extractErrorMessage(err), 'error');
    } finally {
      setPrinting(false);
    }
  }

  const { data: sections, isLoading } = useQuery({
    queryKey: ['pos-menu', activeOutletId],
    queryFn: () => MenuApi.getFullMenu(activeOutletId as string),
    enabled: !!activeOutletId,
  });

  // A Dine order must be tied to a real table (tableId + tableNumber are kept on the order for its whole life).
  const { data: tables } = useQuery({
    queryKey: ['pos-tables', activeOutletId],
    queryFn: () => TableAdminApi.list(activeOutletId as string),
    enabled: !!activeOutletId && orderType === 'DINE_IN',
    select: (rows: { _id: string; tableNumber: string; status: string; isActive?: boolean }[]) => rows.filter((t) => t.status !== 'INACTIVE'),
  });

  const filteredSections = useMemo(() => {
    if (!sections) return [];
    return sections
      .filter((s) => !activeCategory || s.category._id === activeCategory)
      .map((s) => ({ ...s, items: s.items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())) }))
      .filter((s) => s.items.length > 0);
  }, [sections, activeCategory, search]);

  function addToCart(item: { _id: string; name: string; price: number; discountPrice?: number }) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === item._id && l.selectedOptionIds.length === 0);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { menuItemId: item._id, name: item.name, unitPrice: item.discountPrice ?? item.price, quantity: 1, selectedOptionIds: [], selectedOptionLabels: [] }];
    });
  }

  function updateQty(index: number, qty: number) {
    setCart((prev) => (qty <= 0 ? prev.filter((_, i) => i !== index) : prev.map((l, i) => (i === index ? { ...l, quantity: qty } : l))));
  }

  const { data: priced } = useQuery({
    queryKey: ['pos-price', activeOutletId, orderType, cart, discountPercent],
    queryFn: () =>
      StaffOrderApi.priceCart({
        outletId: activeOutletId,
        orderType,
        lines: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, selectedOptionIds: l.selectedOptionIds })),
      }),
    enabled: !!activeOutletId && cart.length > 0,
  });

  const manualDiscountAmount = priced && discountPercent > 0 ? Math.round((priced.subtotal * discountPercent) / 100) : 0;
  const finalTotal = priced ? Math.max(0, priced.total - manualDiscountAmount) : 0;

  const isDineWithoutTable = orderType === 'DINE_IN' && !tableId;
  const isParcelWithoutAddress = orderType === 'DELIVERY' && !(address.line1.trim() && address.city.trim() && address.pincode.trim());
  const cannotPlace = cart.length === 0 || isDineWithoutTable || isParcelWithoutAddress;

  /** `payAfterDining` = Pay After Dine In: order is placed now, payment stays PENDING until staff record it after the meal. */
  const createOrder = useMutation({
    mutationFn: (payAfterDining: boolean) =>
      StaffOrderApi.create({
        outletId: activeOutletId,
        orderType,
        lines: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, selectedOptionIds: l.selectedOptionIds })),
        customerNotes: kitchenComment.trim() || undefined,
        manualDiscount: discountPercent > 0 ? { discountType: 'PERCENT', value: discountPercent, reason: 'POS discount' } : undefined,
        tableId: orderType === 'DINE_IN' ? tableId : undefined,
        deliveryAddress: orderType === 'DELIVERY' ? { ...address, state: 'Jharkhand' } : undefined,
        paymentMethod: payAfterDining ? 'PAY_AFTER_DINE_IN' : undefined,
      }),
    onSuccess: (order, payAfterDining) => {
      queryClient.invalidateQueries({ queryKey: ['kds-board'] });
      queryClient.invalidateQueries({ queryKey: ['current-orders'] });
      setLastOrder(order);
      if (payAfterDining) {
        push(`Order ${order.orderNumber} placed for table ${order.tableNumber} — payment after dining`, 'success');
        resetCart();
        return;
      }
      push(`Order ${order.orderNumber} created — token ${order.tokenNumber}`, 'success');
      setReceiptOrderId(order._id);
      setPaymentModalOpen(true);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  function resetCart() {
    setCart([]);
    setKitchenComment('');
    setDiscountPercent(0);
    setTableId('');
    setAddress({ line1: '', city: '', pincode: '' });
  }

  if (!activeOutletId) {
    return <div className="p-8 text-center text-neutral-500">Select an outlet to start using the POS.</div>;
  }

  return (
    <div className="grid h-full grid-cols-[220px_1fr_360px]">
      {/* LEFT: categories */}
      <aside className="overflow-y-auto border-r border-neutral-200 bg-white p-3">
        <button
          onClick={() => setActiveCategory(null)}
          className={cn('mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium', !activeCategory ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-50')}
        >
          All items
        </button>
        {sections?.map((s) => (
          <button
            key={s.category._id}
            onClick={() => setActiveCategory(s.category._id)}
            className={cn(
              'mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium',
              activeCategory === s.category._id ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-50'
            )}
          >
            {s.category.name}
          </button>
        ))}
      </aside>

      {/* CENTER: products */}
      <section className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-neutral-200 bg-white p-3">
          <div className="flex gap-1.5">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setOrderType(t.value)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', orderType === t.value ? 'bg-ink-900 text-white' : 'bg-neutral-100 text-neutral-600')}
              >
                {t.label}
              </button>
            ))}
          </div>
          {orderType === 'DINE_IN' && (
            <select value={tableId} onChange={(e) => setTableId(e.target.value)} className="h-8 rounded-lg border border-neutral-300 px-2 text-xs">
              <option value="">Select table…</option>
              {tables?.map((t) => (
                <option key={t._id} value={t._id}>
                  Table {t.tableNumber}{t.status === 'OCCUPIED' ? ' (occupied)' : ''}
                </option>
              ))}
            </select>
          )}
          {orderType === 'DELIVERY' && (
            <div className="flex gap-1.5">
              <Input placeholder="Address" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} className="h-8 w-40" />
              <Input placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} className="h-8 w-24" />
              <Input placeholder="Pincode" value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value })} className="h-8 w-24" />
            </div>
          )}
          <div className="relative ml-auto w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input placeholder="Search products (F2)" className="h-8 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading && <p className="text-sm text-neutral-500">Loading menu…</p>}
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
            {filteredSections.flatMap((s) =>
              s.items.map((item) => (
                <button
                  key={item._id}
                  onClick={() => addToCart(item)}
                  className="flex flex-col items-start gap-1 rounded-xl border border-neutral-200 bg-white p-3 text-left hover:border-brand-300 hover:shadow-card"
                >
                  <span className="text-sm font-semibold text-ink-900">{item.name}</span>
                  <span className="text-xs font-bold text-brand-600">{formatCurrency(item.discountPrice ?? item.price)}</span>
                  {!item.isAvailable && <Badge variant="warning">Unavailable</Badge>}
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* RIGHT: cart / order summary */}
      <aside className="flex flex-col overflow-hidden border-l border-neutral-200 bg-white">
        <div className="flex-1 overflow-y-auto p-3">
          <h2 className="mb-2 font-display font-bold text-ink-900">Current Order</h2>
          {cart.length === 0 && <p className="text-sm text-neutral-400">Tap a product to add it.</p>}
          <div className="space-y-2">
            {cart.map((line, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 p-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink-900">{line.name}</p>
                  <p className="text-xs text-neutral-500">{formatCurrency(line.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateQty(idx, line.quantity - 1)} className="rounded p-1 hover:bg-neutral-100">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-sm">{line.quantity}</span>
                  <button onClick={() => updateQty(idx, line.quantity + 1)} className="rounded p-1 hover:bg-neutral-100">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => updateQty(idx, 0)} className="rounded p-1 text-red-500 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {cart.length > 0 && (
            <textarea
              value={kitchenComment}
              onChange={(event) => setKitchenComment(event.target.value)}
              maxLength={500}
              placeholder="Kitchen comment (optional)"
              className="mt-3 h-16 w-full resize-none rounded-lg border border-neutral-200 p-2 text-sm outline-none focus:border-brand-500"
            />
          )}
        </div>

        <div className="space-y-2 border-t border-neutral-200 p-3">
          {canPrintKitchenToken && (
            <div className="rounded-lg bg-neutral-50 px-3 py-2">
              <Button size="sm" variant="outline" disabled={!lastOrder || printing} onClick={() => lastOrder && printKitchenTokenForOrder(lastOrder)}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                {printing ? 'Preparing preview…' : lastOrder ? `Print kitchen token ${lastOrder.tokenNumber}` : 'Print kitchen token'}
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-neutral-400" />
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="Discount %"
              className="h-8"
              value={discountPercent || ''}
              onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
            />
          </div>
          {priced && (
            <div className="space-y-1 text-sm text-neutral-600">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(priced.subtotal)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(priced.tax)}</span></div>
              {priced.packagingCharge > 0 && <div className="flex justify-between"><span>Packaging</span><span>{formatCurrency(priced.packagingCharge)}</span></div>}
              {priced.deliveryCharge > 0 && <div className="flex justify-between"><span>Delivery</span><span>{formatCurrency(priced.deliveryCharge)}</span></div>}
              {manualDiscountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount ({discountPercent}%)</span><span>-{formatCurrency(manualDiscountAmount)}</span></div>}
              <div className="flex justify-between border-t border-neutral-100 pt-1 font-bold text-ink-900"><span>Total</span><span>{formatCurrency(finalTotal)}</span></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={resetCart} disabled={cart.length === 0}>
              <Ban className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
            <Button disabled={cannotPlace || createOrder.isPending} onClick={() => createOrder.mutate(false)}>
              {createOrder.isPending ? 'Placing…' : 'Charge'}
            </Button>
          </div>
          {orderType === 'DINE_IN' && (
            <Button variant="outline" className="w-full" disabled={cannotPlace || createOrder.isPending} onClick={() => createOrder.mutate(true)}>
              <UtensilsCrossed className="mr-1.5 h-4 w-4" /> Pay After Dine In
            </Button>
          )}
        </div>
      </aside>

      {receiptOrderId && (
        <PaymentModal
          open={paymentModalOpen}
          orderId={receiptOrderId}
          total={finalTotal}
          onClose={() => {
            setPaymentModalOpen(false);
            resetCart();
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({ open, orderId, total, onClose }: { open: boolean; orderId: string; total: number; onClose: () => void }) {
  const { push } = useToast();
  const [amount, setAmount] = useState(total);
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [paid, setPaid] = useState(0);

  const pay = useMutation({
    mutationFn: () => StaffPaymentApi.initiate(orderId, method, amount),
    onSuccess: (result) => {
      setPaid((p) => p + amount);
      push(`${method} payment of ${formatCurrency(amount)} recorded`, 'success');
      setAmount(Math.max(0, total - (paid + amount)));
      if (result.remainingAfterThis <= 0) push('Order fully paid', 'success');
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const remaining = Math.max(0, total - paid);

  return (
    <Modal open={open} onClose={onClose} title="Take Payment">
      <div className="space-y-4">
        <div className="rounded-xl bg-neutral-50 p-3 text-center">
          <p className="text-xs text-neutral-500">Amount due</p>
          <p className="font-display text-2xl font-bold text-ink-900">{formatCurrency(remaining)}</p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={cn('rounded-lg border p-2 text-xs font-semibold', method === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600')}
            >
              {m}
            </button>
          ))}
        </div>

        <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} placeholder="Amount for this payment (supports split payments)" />

        <Button className="w-full" disabled={remaining <= 0 || pay.isPending || amount <= 0} onClick={() => pay.mutate()}>
          {pay.isPending ? 'Processing…' : `Pay ${formatCurrency(amount)}`}
        </Button>

        {remaining <= 0 && (
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Done
          </Button>
        )}
      </div>
    </Modal>
  );
}
