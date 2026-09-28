import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, AlertTriangle, Volume2, VolumeX } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { KitchenApi } from '@/services/staffApi';
import { getStaffSocket } from '@/services/socketClient';
import { Badge } from '@/components/ui/primitives';
import { OrderActions } from '@/components/staff/OrderActions';
import { cn } from '@/utils/cn';
import { Order } from '@/types/domain';
import { ORDER_TYPE_LABEL, DASHBOARD_STATUS_LABEL, tableLabel } from '@/utils/orderStatus';

function useOrderAge(createdAt: string) {
  const [age, setAge] = useState(0);
  useEffect(() => {
    const tick = () => setAge(Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [createdAt]);
  return age;
}

const LOAD_COLORS: Record<string, string> = {
  normal: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  busy: 'bg-amber-100 text-amber-700 border-amber-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
};

export default function KDSPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const [soundOn, setSoundOn] = useState(true);

  const { data: board } = useQuery({
    queryKey: ['kds-board', activeOutletId],
    queryFn: () => KitchenApi.board(activeOutletId as string),
    enabled: !!activeOutletId,
    refetchInterval: 15000, // polling fallback alongside the socket push below
  });

  const { data: workload } = useQuery({
    queryKey: ['kds-workload', activeOutletId],
    queryFn: () => KitchenApi.workload(activeOutletId as string),
    enabled: !!activeOutletId,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!activeOutletId) return;
    const socket = getStaffSocket();
    socket.emit('kds:subscribe', activeOutletId);

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['kds-board', activeOutletId] });
    const onNewOrder = () => {
      invalidate();
      if (soundOn) playChime();
    };

    socket.on('kds:new_order', onNewOrder);
    socket.on('kds:order_update', invalidate);
    socket.on('kitchen:updated', () => queryClient.invalidateQueries({ queryKey: ['kds-workload', activeOutletId] }));

    return () => {
      socket.emit('kds:unsubscribe', activeOutletId);
      socket.off('kds:new_order', onNewOrder);
      socket.off('kds:order_update', invalidate);
    };
  }, [activeOutletId, queryClient, soundOn]);

  // Which buttons each ticket shows is decided by the backend state machine (order.availableActions).
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['kds-board', activeOutletId] });
    queryClient.invalidateQueries({ queryKey: ['kds-workload', activeOutletId] });
  };

  if (!activeOutletId) return <div className="p-8 text-center text-neutral-400">Select an outlet to view its kitchen display.</div>;

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <h1 className="font-display text-xl font-bold">Kitchen Display</h1>
        <div className="flex items-center gap-3">
          {workload && (
            <span className={cn('rounded-full border px-3 py-1 text-xs font-bold uppercase', LOAD_COLORS[workload.state])}>
              {workload.state} · {workload.activeOrders} active
              {workload.delayedOrders > 0 && ` · ${workload.delayedOrders} delayed`}
            </span>
          )}
          <button onClick={() => setSoundOn((s) => !s)} className="rounded-full p-2 hover:bg-white/10" aria-label="Toggle sound">
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-3 gap-4 overflow-hidden p-4">
        <KdsColumn title="NEW" orders={board?.new ?? []} accent="border-blue-500" onChanged={refresh} />
        <KdsColumn title="PREPARING" orders={board?.preparing ?? []} accent="border-amber-500" onChanged={refresh} />
        <KdsColumn title="READY" orders={board?.ready ?? []} accent="border-emerald-500" onChanged={refresh} />
      </div>
    </div>
  );
}

function KdsColumn({ title, orders, accent, onChanged }: { title: string; orders: Order[]; accent: string; onChanged: () => void }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-white/5">
      <div className={cn('border-b-2 px-4 py-2 font-display text-sm font-bold uppercase tracking-wide', accent)}>
        {title} ({orders.length})
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {orders.length === 0 && <p className="py-8 text-center text-sm text-white/30">No orders</p>}
        {orders.map((order) => (
          <KdsCard key={order._id} order={order} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function KdsCard({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const ageMinutes = useOrderAge(order.createdAt);
  const isDelayed = ageMinutes > 15;
  const table = tableLabel(order);

  return (
    <div className={cn('rounded-xl border-2 bg-neutral-900 p-3', isDelayed ? 'border-red-500' : 'border-white/10')}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-lg font-extrabold text-brand-400">#{order.tokenNumber}</span>
        <div className="flex items-center gap-1.5">
          {table && <Badge variant="outline" className="border-white/30 text-white">{table}</Badge>}
          <Badge variant={order.orderType === 'DELIVERY' ? 'default' : 'outline'} className="bg-white/10 text-white">
            {ORDER_TYPE_LABEL[order.orderType]}
          </Badge>
        </div>
      </div>

      <div className={cn('mb-2 flex items-center gap-1 text-xs', isDelayed ? 'text-red-400' : 'text-white/50')}>
        {isDelayed ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
        {ageMinutes} min ago · {DASHBOARD_STATUS_LABEL[order.orderStatus]}
      </div>

      <ul className="mb-3 space-y-1 text-sm">
        {order.items.map((item, idx) => (
          <li key={idx}>
            <span className="font-semibold">{item.quantity}×</span> {item.name}
            {item.selectedModifiers.length > 0 && (
              <div className="pl-4 text-xs text-white/50">{item.selectedModifiers.map((m) => m.optionName).join(', ')}</div>
            )}
          </li>
        ))}
      </ul>

      <OrderActions order={order} onChanged={onChanged} only="STATUS" dark />
    </div>
  );
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Web Audio unavailable - silent failure is acceptable, sound is a nicety not a requirement
  }
}
