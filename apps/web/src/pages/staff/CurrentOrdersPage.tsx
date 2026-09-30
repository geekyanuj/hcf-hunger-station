import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, UtensilsCrossed, Bike, Wallet } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { StaffOrderApi, StaffPaymentApi } from '@/services/staffApi';
import { useSessionStore } from '@/stores/session.store';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { Button } from '@/components/ui/Button';
import { getStaffSocket } from '@/services/socketClient';
import { Card, CardContent } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { OrderActions } from '@/components/staff/OrderActions';
import { Order, OrderStatus } from '@/types/domain';
import { formatCurrency, cn } from '@/utils/cn';
import { DASHBOARD_STATUS_LABEL, DELIVERY_STATUS_LABEL, ORDER_TYPE_LABEL, PAYMENT_STATUS_LABEL, STATUS_BADGE_CLASS } from '@/utils/orderStatus';

const FILTERS: { key: 'ACTIVE' | OrderStatus; label: string }[] = [
  { key: 'ACTIVE', label: 'All active' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const REALTIME_EVENTS = [
  'ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_PREPARING', 'ORDER_READY', 'ORDER_OUT_FOR_DELIVERY',
  'ORDER_COMPLETED', 'ORDER_CANCELLED', 'PAYMENT_UPDATED', 'DELIVERY_UPDATED', 'DASHBOARD_UPDATED',
];

export default function CurrentOrdersPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'ACTIVE' | OrderStatus>('ACTIVE');
  const [viewing, setViewing] = useState<Order | null>(null);
  const [paying, setPaying] = useState<Order | null>(null);
  const { hasPermission } = useSessionStore();
  const canRecordPayment = hasPermission('payments.process');
  const queryKey = ['current-orders', activeOutletId];

  const { data } = useQuery({
    queryKey,
    queryFn: () => StaffOrderApi.current(activeOutletId as string, { includeClosed: true }),
    enabled: !!activeOutletId,
    refetchInterval: 20000, // polling fallback alongside the socket push below
  });

  // Every successful transition on the server broadcasts an event (only after the DB write succeeded).
  useEffect(() => {
    if (!activeOutletId) return;
    const socket = getStaffSocket();
    socket.emit('staff:subscribe', activeOutletId);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['current-orders', activeOutletId] });
    REALTIME_EVENTS.forEach((e) => socket.on(e, refresh));
    return () => {
      socket.emit('staff:unsubscribe', activeOutletId);
      REALTIME_EVENTS.forEach((e) => socket.off(e, refresh));
    };
  }, [activeOutletId, queryClient]);

  const orders = data?.orders ?? [];
  const counts = data?.counts ?? {};
  const visible = useMemo(() => {
    const active = new Set<OrderStatus>(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']);
    return orders.filter((o) => (filter === 'ACTIVE' ? active.has(o.orderStatus) : o.orderStatus === filter));
  }, [orders, filter]);

  if (!activeOutletId) return <div className="p-8 text-center text-neutral-400">Select an outlet to see its orders.</div>;

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-6 w-6 text-brand-500" />
        <h1 className="font-display text-2xl font-bold text-ink-900">Current Orders</h1>
      </div>

      {/* Status filters double as live counters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = f.key === 'ACTIVE' ? (['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const).reduce((s, k) => s + (counts[k] ?? 0), 0) : counts[f.key] ?? 0;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', filter === f.key ? 'bg-ink-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50')}
            >
              {f.label} <span className="ml-1 opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 && <p className="py-12 text-center text-neutral-400">No orders here.</p>}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {visible.map((order) => (
          <Card key={order._id}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl font-extrabold text-brand-600">{order.tokenNumber}</p>
                  <p className="text-xs text-neutral-500">
                    {order.orderNumber} · {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_BADGE_CLASS[order.orderStatus])}>{DASHBOARD_STATUS_LABEL[order.orderStatus]}</span>
                  <span className="text-[11px] text-neutral-500">{PAYMENT_STATUS_LABEL[order.paymentStatus]}{order.paymentMethod === 'PAY_AFTER_DINE_IN' ? ' · pay after dining' : ''}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
                <span className="font-semibold text-ink-900">{ORDER_TYPE_LABEL[order.orderType]}</span>
                {order.tableNumber && (
                  <span className="inline-flex items-center gap-1"><UtensilsCrossed className="h-3.5 w-3.5" /> Table {order.tableNumber}</span>
                )}
                {order.orderType === 'DELIVERY' && order.deliveryStatus && (
                  <span className="inline-flex items-center gap-1"><Bike className="h-3.5 w-3.5" /> {DELIVERY_STATUS_LABEL[order.deliveryStatus]}</span>
                )}
                <span className="ml-auto font-bold text-ink-900">{formatCurrency(order.total)}</span>
              </div>

              <ul className="space-y-0.5 text-sm text-neutral-700">
                {order.items.slice(0, 4).map((i, idx) => (
                  <li key={idx}>
                    <span className="font-semibold">{i.quantity}×</span> {i.name}
                  </li>
                ))}
                {order.items.length > 4 && <li className="text-xs text-neutral-400">+{order.items.length - 4} more</li>}
              </ul>

              {order.orderStatus === 'CANCELLED' && order.cancellationReason && (
                <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
                  Cancelled by {order.cancelledBy?.toLowerCase()} — {order.cancellationReason}
                </p>
              )}

              <OrderActions order={order} onChanged={refresh} onView={setViewing} />

              {/* Payment is a separate lifecycle: e.g. Pay After Dine In stays PENDING after the order is COMPLETED until staff record it. */}
              {canRecordPayment && order.orderStatus !== 'CANCELLED' && ['PENDING', 'PARTIALLY_PAID', 'FAILED'].includes(order.paymentStatus) && (
                <Button size="sm" variant="outline" onClick={() => setPaying(order)}>
                  <Wallet className="mr-1.5 h-3.5 w-3.5" /> Record Payment
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <RecordPaymentModal order={paying} onClose={() => setPaying(null)} onDone={refresh} />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Order ${viewing.orderNumber} · ${viewing.tokenNumber}` : ''}>
        {viewing && <OrderTimeline order={viewing} />}
      </Modal>
    </div>
  );
}

/** Full status timeline (status, time, who, note) from the order's status history. */
function OrderTimeline({ order }: { order: Order }) {
  return (
    <div className="space-y-4 text-ink-900">
      <div className="text-sm text-neutral-600">
        {ORDER_TYPE_LABEL[order.orderType]}
        {order.tableNumber ? ` · Table ${order.tableNumber}` : ''} · {formatCurrency(order.total)} · {PAYMENT_STATUS_LABEL[order.paymentStatus]}
      </div>
      <ol className="space-y-2 border-l-2 border-neutral-200 pl-4">
        {(order.statusHistory ?? []).map((h, idx) => (
          <li key={idx} className="relative">
            <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
            <p className="text-sm font-semibold">
              {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {DASHBOARD_STATUS_LABEL[h.status]}
            </p>
            <p className="text-xs text-neutral-500">
              {h.changedByRole}
              {h.note ? ` — ${h.note}` : ''}
            </p>
          </li>
        ))}
      </ol>
      {order.orderStatus === 'CANCELLED' && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          <p>Cancelled by {order.cancelledBy?.toLowerCase()} from {order.previousOrderStatus ? DASHBOARD_STATUS_LABEL[order.previousOrderStatus] : '—'}</p>
          {order.cancellationReason && <p>Reason: {order.cancellationReason}</p>}
          {order.cancellationNote && <p>Note: {order.cancellationNote}</p>}
        </div>
      )}
    </div>
  );
}

function RecordPaymentModal({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: () => void }) {
  const { push } = useToast();
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const pay = useMutation({
    // No amount = the full remaining balance is charged (the server computes it from recorded payments).
    mutationFn: () => StaffPaymentApi.initiate((order as Order)._id, method),
    onSuccess: (result) => {
      push(result.payment?.status === 'SUCCESS' ? 'Payment recorded' : 'Payment initiated — awaiting confirmation', 'success');
      onDone();
      onClose();
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });
  return (
    <Modal open={!!order} onClose={onClose} title={order ? `Record payment — ${order.tokenNumber}` : ''}>
      {order && (
        <div className="space-y-3 text-ink-900">
          <p className="text-sm text-neutral-600">
            Order total {formatCurrency(order.total)}. This records the remaining balance and does not change the order status.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'UPI', 'CARD'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cn('rounded-lg border p-2 text-xs font-semibold', method === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600')}
              >
                {m}
              </button>
            ))}
          </div>
          <Button className="w-full" disabled={pay.isPending} onClick={() => pay.mutate()}>
            {pay.isPending ? 'Recording…' : 'Record payment'}
          </Button>
        </div>
      )}
    </Modal>
  );
}
