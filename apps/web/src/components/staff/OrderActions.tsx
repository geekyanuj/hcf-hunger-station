import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Printer, Eye, UserPlus, Ban } from 'lucide-react';
import { StaffOrderApi, DeliveryApi } from '@/services/staffApi';
import { extractErrorMessage } from '@/services/apiClient';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Order, OrderAction } from '@/types/domain';
import { printCustomerReceipt, printKitchenTicket } from '@/utils/printOrder';
import { printTokenForOrder } from '@/utils/printToken';
import { cn } from '@/utils/cn';

/**
 * Renders the buttons for one order.
 *
 * It never decides which actions are valid: the backend state machine returns
 * `order.availableActions` for the logged-in user, and this component draws
 * exactly that list (no status dropdown, nothing for terminal orders).
 * Every status click sends `expectedStatus`, so if a colleague already moved
 * the order the API answers "Order status has already been updated." and the
 * board refreshes instead of applying a stale click.
 */
export function OrderActions({
  order,
  onChanged,
  only = 'ALL',
  dark = false,
  onView,
  size = 'sm',
}: {
  order: Order;
  onChanged: () => void;
  /** 'STATUS' shows only status-changing / delivery actions (used on the kitchen display). */
  only?: 'ALL' | 'STATUS';
  dark?: boolean;
  onView?: (order: Order) => void;
  size?: 'sm' | 'default';
}) {
  const { push } = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [riderId, setRiderId] = useState('');

  const actions = (order.availableActions ?? []).filter((a) => (only === 'STATUS' ? a.kind === 'STATUS' || a.kind === 'ASSIGN_DELIVERY' : true));

  const onError = (err: unknown) => {
    push(extractErrorMessage(err), 'error');
    onChanged(); // pick up whatever the latest state really is
  };

  const changeStatus = useMutation({
    mutationFn: (a: OrderAction) => StaffOrderApi.updateStatus(order._id, a.targetStatus as string, { expectedStatus: order.orderStatus }),
    onSuccess: onChanged,
    onError,
  });

  const cancel = useMutation({
    mutationFn: () => StaffOrderApi.cancel(order._id, { reason: reason.trim() || undefined, note: note.trim() || undefined, expectedStatus: order.orderStatus }),
    onSuccess: () => {
      push(`Order ${order.tokenNumber} cancelled`, 'success');
      setCancelOpen(false);
      setReason('');
      setNote('');
      onChanged();
    },
    onError,
  });

  const { data: executives } = useQuery({
    queryKey: ['delivery-executives', order.outletId],
    queryFn: () => DeliveryApi.executives(order.outletId),
    enabled: assignOpen,
  });

  const assign = useMutation({
    mutationFn: () => DeliveryApi.assign(order._id, riderId),
    onSuccess: () => {
      push('Delivery executive assigned', 'success');
      setAssignOpen(false);
      setRiderId('');
      onChanged();
    },
    onError,
  });

  const cancelAction = actions.find((a) => a.key === 'CANCEL');
  const needsReason = !!cancelAction?.requiresReason;

  function run(a: OrderAction) {
    switch (a.kind) {
      case 'STATUS':
        if (a.key === 'CANCEL') setCancelOpen(true);
        else changeStatus.mutate(a);
        break;
      case 'ASSIGN_DELIVERY':
        setAssignOpen(true);
        break;
      case 'PRINT':
        if (a.key === 'PRINT_KITCHEN') printKitchenTicket(order);
        else if (a.key === 'PRINT_TOKEN')
          printTokenForOrder(order._id, order.tokenNumber)
            .then((o) => push(o.message, o.via === 'BROWSER_FALLBACK' ? 'info' : 'success'))
            .catch((e) => push(extractErrorMessage(e), 'error'));
        else printCustomerReceipt(order).catch((e) => push(extractErrorMessage(e), 'error'));
        break;
      case 'VIEW':
        onView?.(order);
        break;
    }
  }

  function iconFor(a: OrderAction) {
    if (a.kind === 'PRINT') return <Printer className="mr-1.5 h-3.5 w-3.5" />;
    if (a.kind === 'VIEW') return <Eye className="mr-1.5 h-3.5 w-3.5" />;
    if (a.kind === 'ASSIGN_DELIVERY') return <UserPlus className="mr-1.5 h-3.5 w-3.5" />;
    if (a.key === 'CANCEL') return <Ban className="mr-1.5 h-3.5 w-3.5" />;
    return null;
  }

  function variantFor(a: OrderAction): 'default' | 'outline' | 'destructive' | 'ghost' {
    if (a.key === 'CANCEL') return 'outline';
    if (a.kind === 'PRINT' || a.kind === 'VIEW' || a.kind === 'ASSIGN_DELIVERY') return 'outline';
    return 'default';
  }

  if (actions.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <Button
            key={a.key}
            size={size}
            variant={variantFor(a)}
            title={a.disabledReason}
            disabled={!a.enabled || changeStatus.isPending}
            onClick={() => run(a)}
            className={cn(
              a.key === 'CANCEL' && 'border-red-200 text-red-600 hover:bg-red-50',
              dark && a.kind !== 'STATUS' && 'border-white/20 bg-transparent text-white hover:bg-white/10',
              dark && a.key === 'CANCEL' && 'border-red-400/40 text-red-300 hover:bg-red-500/10'
            )}
          >
            {iconFor(a)}
            {a.label}
          </Button>
        ))}
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel order ${order.tokenNumber}?`}>
        <div className="space-y-3 text-ink-900">
          {needsReason && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Preparation has already started. This is a staff/admin override — a reason is required and will be recorded.
            </p>
          )}
          {order.paymentStatus === 'PAID' && <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-800">This order is already paid — remember to issue a refund separately.</p>}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder={needsReason ? 'Reason (required)' : 'Reason (optional)'}
            className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-brand-500"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Note (optional)"
            className="h-16 w-full resize-none rounded-xl border border-neutral-300 p-3 text-sm outline-none focus:border-brand-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="destructive" disabled={cancel.isPending || (needsReason && reason.trim().length < 3)} onClick={() => cancel.mutate()}>
              {cancel.isPending ? 'Cancelling…' : 'Cancel order'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={`Assign delivery — ${order.tokenNumber}`}>
        <div className="space-y-3 text-ink-900">
          <select value={riderId} onChange={(e) => setRiderId(e.target.value)} className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm">
            <option value="">Select delivery executive…</option>
            {executives?.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
          {executives?.length === 0 && <p className="text-xs text-neutral-500">No active delivery executives at this outlet.</p>}
          <Button className="w-full" disabled={!riderId || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
