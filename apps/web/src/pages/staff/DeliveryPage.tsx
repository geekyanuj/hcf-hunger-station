import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, MapPin, IndianRupee, User } from 'lucide-react';
import { useSessionStore } from '@/stores/session.store';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { DeliveryApi, StaffOrderApi } from '@/services/staffApi';
import { getStaffSocket } from '@/services/socketClient';
import { Card, CardContent, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils/cn';
import { Order, OrderAction } from '@/types/domain';
import { DELIVERY_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@/utils/orderStatus';
import { OrderActions } from '@/components/staff/OrderActions';

type DeliveryOrder = Order & { deliveryStaffName?: string };

const hasAction = (order: Order, key: OrderAction['key']) => !!order.availableActions?.some((a) => a.key === key && a.enabled);

const REALTIME_EVENTS = ['DELIVERY_UPDATED', 'ORDER_READY', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'DASHBOARD_UPDATED'];

/**
 * Delivery dashboard. Delivery progress (deliveryStatus) is shown and driven
 * separately from the order lifecycle (orderStatus); the order-level steps
 * (Out for Delivery / Complete) are only offered when the backend says the
 * logged-in user may perform them.
 */
export default function DeliveryPage() {
  const { role, hasPermission } = useSessionStore();
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const isRider = role === 'DELIVERY';
  const canDispatch = !isRider && hasPermission('delivery.assign');

  const { data: myOrders } = useQuery({ queryKey: ['my-deliveries'], queryFn: DeliveryApi.myOrders, enabled: isRider });
  const { data: unassigned } = useQuery({
    queryKey: ['unassigned-deliveries', activeOutletId],
    queryFn: () => DeliveryApi.unassigned(activeOutletId as string),
    enabled: canDispatch && !!activeOutletId,
  });
  const { data: inFlight } = useQuery({
    queryKey: ['inflight-deliveries', activeOutletId],
    queryFn: () => DeliveryApi.inFlight(activeOutletId as string),
    enabled: canDispatch && !!activeOutletId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-deliveries'] });
    queryClient.invalidateQueries({ queryKey: ['unassigned-deliveries'] });
    queryClient.invalidateQueries({ queryKey: ['inflight-deliveries'] });
  };

  useEffect(() => {
    const socket = getStaffSocket();
    if (activeOutletId) socket.emit('staff:subscribe', activeOutletId);
    REALTIME_EVENTS.forEach((e) => socket.on(e, refresh));
    return () => {
      REALTIME_EVENTS.forEach((e) => socket.off(e, refresh));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOutletId]);

  const onError = (err: unknown) => {
    push(extractErrorMessage(err), 'error');
    refresh();
  };

  const pickedUp = useMutation({ mutationFn: (id: string) => DeliveryApi.pickedUp(id), onSuccess: refresh, onError });
  const advance = useMutation({
    mutationFn: ({ order, target }: { order: Order; target: 'OUT_FOR_DELIVERY' | 'COMPLETED' }) =>
      StaffOrderApi.updateStatus(order._id, target, { expectedStatus: order.orderStatus }),
    onSuccess: refresh,
    onError,
  });

  return (
    <div className="mx-auto h-full max-w-3xl space-y-6 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <Bike className="h-6 w-6 text-brand-500" />
        <h1 className="font-display text-2xl font-bold text-ink-900">Delivery</h1>
      </div>

      {isRider && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">My Deliveries</h2>
          {myOrders?.length === 0 && <p className="text-neutral-400">No deliveries assigned right now.</p>}
          {myOrders?.map((order: DeliveryOrder) => (
            <Card key={order._id}>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-bold text-brand-600">{order.tokenNumber}</span>
                  <div className="flex gap-1.5">
                    {order.deliveryStatus && <Badge variant="outline">{DELIVERY_STATUS_LABEL[order.deliveryStatus]}</Badge>}
                    <Badge variant={order.paymentStatus === 'PAID' ? 'success' : 'warning'}>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>
                  </div>
                </div>
                {order.deliveryAddress && (
                  <p className="flex items-start gap-1.5 text-sm text-neutral-600">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {order.deliveryAddress.line1}, {order.deliveryAddress.city} {order.deliveryAddress.pincode}
                  </p>
                )}
                <p className="flex items-center gap-1.5 text-sm text-neutral-600"><IndianRupee className="h-4 w-4" /> {formatCurrency(order.total)}</p>
                <div className="flex flex-wrap gap-2">
                  {order.orderStatus === 'READY' && order.deliveryStatus === 'ASSIGNED' && (
                    <Button size="sm" disabled={pickedUp.isPending} onClick={() => pickedUp.mutate(order._id)}>Mark Picked Up</Button>
                  )}
                  {order.orderStatus === 'READY' && order.deliveryStatus === 'PICKED_UP' && hasAction(order, 'MARK_OUT_FOR_DELIVERY') && (
                    <Button size="sm" disabled={advance.isPending} onClick={() => advance.mutate({ order, target: 'OUT_FOR_DELIVERY' })}>Start Delivery</Button>
                  )}
                  {order.orderStatus === 'OUT_FOR_DELIVERY' && hasAction(order, 'COMPLETE') && (
                    <Button size="sm" disabled={advance.isPending} onClick={() => advance.mutate({ order, target: 'COMPLETED' })}>Mark Delivered</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canDispatch && (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Ready — needs a delivery executive</h2>
            {unassigned?.length === 0 && <p className="text-neutral-400">No unassigned delivery orders.</p>}
            {unassigned?.map((order: DeliveryOrder) => (
              <Card key={order._id}>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-ink-900">{order.orderNumber} · {order.tokenNumber}</p>
                    <p className="text-sm text-neutral-500">{formatCurrency(order.total)}</p>
                  </div>
                  <OrderActions order={order} onChanged={refresh} only="STATUS" />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Assigned &amp; on the road</h2>
            {inFlight?.length === 0 && <p className="text-neutral-400">Nothing in flight.</p>}
            {inFlight?.map((order: DeliveryOrder) => (
              <Card key={order._id}>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-ink-900">{order.orderNumber} · {order.tokenNumber}</p>
                    {order.deliveryStatus && <Badge variant="outline">{DELIVERY_STATUS_LABEL[order.deliveryStatus]}</Badge>}
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-neutral-600"><User className="h-4 w-4" /> {order.deliveryStaffName ?? 'Delivery executive'}</p>
                  <OrderActions order={order} onChanged={refresh} only="STATUS" />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
