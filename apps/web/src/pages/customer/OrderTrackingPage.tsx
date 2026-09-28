import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Loader2, XCircle, Bike, UtensilsCrossed } from 'lucide-react';
import { OrderApi } from '@/services/domainApi';
import { getSocket } from '@/services/socketClient';
import { extractErrorMessage } from '@/services/apiClient';
import { Card, CardContent, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { OrderStatus } from '@/types/domain';
import { cn } from '@/utils/cn';
import {
  customerStatusLabel,
  customerTimelineSteps,
  DELIVERY_STATUS_LABEL,
  flowFor,
  PAYMENT_STATUS_LABEL,
} from '@/utils/orderStatus';

const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export default function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [socketConnected, setSocketConnected] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => OrderApi.getById(orderId as string),
    enabled: !!orderId,
    // Polling fallback: if the socket connection drops, this keeps the
    // tracking screen fresh every 8s regardless.
    refetchInterval: socketConnected ? false : 8000,
  });

  useEffect(() => {
    if (!orderId) return;
    const socket = getSocket();
    socket.emit('order:subscribe', orderId);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['order', orderId] });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('order:status_update', refresh);
    socket.on('order:payment_update', refresh);
    socket.on('DELIVERY_UPDATED', refresh);
    setSocketConnected(socket.connected);

    return () => {
      socket.emit('order:unsubscribe', orderId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('order:status_update', refresh);
      socket.off('order:payment_update', refresh);
      socket.off('DELIVERY_UPDATED', refresh);
    };
  }, [orderId, queryClient]);

  const cancel = useMutation({
    mutationFn: () => OrderApi.cancel(orderId as string, reason.trim() || undefined),
    onSuccess: () => {
      push('Your order has been cancelled', 'success');
      setCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    },
    onError: (err) => {
      push(extractErrorMessage(err), 'error');
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });

  if (isLoading || !order) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const steps = customerTimelineSteps(order.orderType);
  const isCancelled = order.orderStatus === 'CANCELLED';
  const currentIndex = isCancelled ? -1 : steps.indexOf(order.orderStatus);
  const flow = flowFor(order.orderType);
  const timeOf = (status: OrderStatus) => order.statusHistory?.find((h) => h.status === status)?.timestamp;
  // The backend decides whether the customer may still cancel (PENDING / CONFIRMED only).
  const canCancel = !!order.availableActions?.some((a) => a.key === 'CANCEL' && a.enabled);
  const showEta = ['PENDING', 'CONFIRMED', 'PREPARING'].includes(order.orderStatus);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="text-center">
        <p className="text-sm text-neutral-500">Order {order.orderNumber}</p>
        <h1 className="font-display text-4xl font-extrabold text-brand-600">{order.tokenNumber}</h1>
        {flow === 'DINE' && order.tableNumber && (
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-ink-900">
            <UtensilsCrossed className="h-4 w-4" /> Table {order.tableNumber}
          </p>
        )}
        {!socketConnected && (
          <p className="mt-1 text-xs text-amber-600">Live updates unavailable — refreshing automatically every few seconds.</p>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4">
          <p className={cn('text-center font-display text-xl font-bold', isCancelled ? 'text-red-600' : order.orderStatus === 'READY' || order.orderStatus === 'COMPLETED' ? 'text-emerald-600' : 'text-ink-900')}>
            {customerStatusLabel(order.orderStatus, order.orderType)}
          </p>

          {isCancelled ? (
            <div className="space-y-1 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700">
              <XCircle className="mx-auto h-6 w-6" />
              <p>
                Cancelled {order.cancelledAt ? `at ${fmtTime(order.cancelledAt)}` : ''}
                {order.cancelledBy === 'CUSTOMER' ? ' by you' : ' by the restaurant'}
              </p>
              {order.cancellationReason && <p className="text-xs">Reason: {order.cancellationReason}</p>}
              {order.paymentStatus === 'PAID' && <p className="text-xs">Your payment will be refunded by the restaurant.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {steps.map((step, idx) => {
                const done = idx <= currentIndex;
                const at = timeOf(step);
                return (
                  <div key={step} className="flex items-center gap-3">
                    {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-neutral-300" />}
                    <span className={cn('flex-1 text-sm', done ? 'font-semibold text-ink-900' : 'text-neutral-400')}>
                      {customerStatusLabel(step, order.orderType)}
                    </span>
                    {done && at && <span className="text-xs text-neutral-400">{fmtTime(at)}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {flow === 'PARCEL' && order.deliveryStatus && !isCancelled && ['READY', 'OUT_FOR_DELIVERY'].includes(order.orderStatus) && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-neutral-600">
              <Bike className="h-4 w-4" /> {DELIVERY_STATUS_LABEL[order.deliveryStatus]}
            </p>
          )}

          {showEta && (
            <div className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-xs text-brand-700">Estimated wait</p>
              <p className="font-display text-lg font-bold text-brand-700">
                {order.estimatedPreparationMinutesMin}–{order.estimatedPreparationMinutesMax} minutes
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-2">
            <Badge variant={order.paymentStatus === 'PAID' ? 'success' : 'outline'}>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>
            {order.paymentMethod === 'PAY_AFTER_DINE_IN' && <Badge variant="outline">Pay after dining</Badge>}
          </div>

          {canCancel && (
            <Button variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50" onClick={() => setCancelOpen(true)}>
              Cancel order
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2">
          <h2 className="font-semibold text-ink-900">Order items</h2>
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm text-neutral-600">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span>{item.lineTotal}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order?">
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">You can cancel until the kitchen starts preparing your food. This can’t be undone.</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Reason (optional)"
            className="h-20 w-full resize-none rounded-xl border border-neutral-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button disabled={cancel.isPending} onClick={() => cancel.mutate()} className="bg-red-600 hover:bg-red-700">
              {cancel.isPending ? 'Cancelling…' : 'Yes, cancel'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
