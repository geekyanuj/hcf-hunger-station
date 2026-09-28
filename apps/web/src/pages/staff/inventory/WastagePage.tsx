import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { WastageApi, InventoryApi } from '@/services/staffApi';
import { Card, CardContent, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils/cn';

const REASONS = ['BURNT_FOOD', 'EXPIRED', 'SPOILAGE', 'PREPARATION_MISTAKE', 'CANCELLATION', 'DAMAGED_PACKAGING', 'OTHER'];

export default function WastagePage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ inventoryItemId: '', quantity: 0, reason: 'SPOILAGE', notes: '' });

  const { data } = useQuery({
    queryKey: ['wastage', activeOutletId],
    queryFn: () => WastageApi.list(activeOutletId as string, { limit: 50 }),
    enabled: !!activeOutletId,
  });
  const { data: itemsResp } = useQuery({
    queryKey: ['inventory-items-all', activeOutletId],
    queryFn: () => InventoryApi.list(activeOutletId as string, { limit: 200 }),
    enabled: !!activeOutletId && open,
  });
  const items = itemsResp?.data ?? [];

  const create = useMutation({
    mutationFn: () => WastageApi.create({ ...form, outletId: activeOutletId }),
    onSuccess: () => {
      push('Wastage recorded — stock updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['wastage'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setForm({ inventoryItemId: '', quantity: 0, reason: 'SPOILAGE', notes: '' });
      setOpen(false);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const records = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Record wastage
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Item</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Value</th>
                <th className="p-3">Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {records.map((w: {
                _id: string; createdAt: string; quantity: number; reason: string; estimatedValue: number;
                inventoryItemId?: { name: string; unit: string }; recordedByUserId?: { name: string };
              }) => (
                <tr key={w._id} className="border-b border-neutral-50">
                  <td className="p-3 text-neutral-500">{new Date(w.createdAt).toLocaleDateString()}</td>
                  <td className="p-3 font-medium text-ink-900">{w.inventoryItemId?.name}</td>
                  <td className="p-3">{w.quantity} {w.inventoryItemId?.unit}</td>
                  <td className="p-3"><Badge variant="warning">{w.reason.replace('_', ' ')}</Badge></td>
                  <td className="p-3 text-red-600">{formatCurrency(w.estimatedValue)}</td>
                  <td className="p-3 text-neutral-500">{w.recordedByUserId?.name}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-neutral-400">No wastage recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Record wastage">
        <div className="space-y-3">
          <select value={form.inventoryItemId} onChange={(e) => setForm({ ...form, inventoryItemId: e.target.value })} className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm">
            <option value="">Select item</option>
            {items.map((i: { _id: string; name: string; unit: string }) => <option key={i._id} value={i._id}>{i.name} ({i.unit})</option>)}
          </select>
          <Input type="number" placeholder="Quantity" value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm">
            {REASONS.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
          <Input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button className="w-full" disabled={!form.inventoryItemId || form.quantity <= 0 || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Saving…' : 'Record wastage'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
