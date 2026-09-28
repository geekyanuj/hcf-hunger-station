import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, X } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { PurchaseApi, SupplierApi, InventoryApi } from '@/services/staffApi';
import { Card, CardContent, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils/cn';

interface PurchaseLine {
  inventoryItemId: string;
  name: string;
  quantity: number;
  rate: number;
}

const STATUS_VARIANT: Record<string, 'outline' | 'success' | 'warning'> = {
  DRAFT: 'outline',
  COMPLETED: 'success',
  CANCELLED: 'warning',
};

export default function PurchasesPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['purchases', activeOutletId],
    queryFn: () => PurchaseApi.list(activeOutletId as string, { limit: 50 }),
    enabled: !!activeOutletId,
  });

  const complete = useMutation({
    mutationFn: (id: string) => PurchaseApi.complete(id),
    onSuccess: () => {
      push('Purchase completed — stock updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const purchases = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New purchase
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="p-3">PO #</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p: { _id: string; purchaseNumber: string; total: number; status: string; supplierId?: { name: string } }) => (
                <tr key={p._id} className="border-b border-neutral-50">
                  <td className="p-3 font-medium text-ink-900">{p.purchaseNumber}</td>
                  <td className="p-3 text-neutral-600">{p.supplierId?.name}</td>
                  <td className="p-3">{formatCurrency(p.total)}</td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge></td>
                  <td className="p-3">
                    {p.status === 'DRAFT' && (
                      <Button size="sm" onClick={() => complete.mutate(p._id)}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" /> Receive stock
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-neutral-400">No purchases yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CreatePurchaseModal open={open} onClose={() => setOpen(false)} outletId={activeOutletId} />
    </div>
  );
}

function CreatePurchaseModal({ open, onClose, outletId }: { open: boolean; onClose: () => void; outletId: string | null }) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [qty, setQty] = useState(0);
  const [rate, setRate] = useState(0);

  const { data: suppliers } = useQuery({ queryKey: ['suppliers', outletId], queryFn: () => SupplierApi.list(outletId as string), enabled: !!outletId && open });
  const { data: itemsResp } = useQuery({ queryKey: ['inventory-items-all', outletId], queryFn: () => InventoryApi.list(outletId as string, { limit: 200 }), enabled: !!outletId && open });
  const items = itemsResp?.data ?? [];

  const create = useMutation({
    mutationFn: () =>
      PurchaseApi.create({
        outletId,
        supplierId,
        lines: lines.map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: l.quantity, rate: l.rate })),
      }),
    onSuccess: () => {
      push('Purchase order created (draft)', 'success');
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setLines([]);
      setSupplierId('');
      onClose();
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  function addLine() {
    const item = items.find((i: { _id: string; name: string }) => i._id === selectedItemId);
    if (!item || qty <= 0 || rate <= 0) return;
    setLines((prev) => [...prev, { inventoryItemId: item._id, name: item.name, quantity: qty, rate }]);
    setSelectedItemId('');
    setQty(0);
    setRate(0);
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.rate, 0);

  return (
    <Modal open={open} onClose={onClose} title="New purchase order">
      <div className="space-y-3">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm">
          <option value="">Select supplier</option>
          {suppliers?.map((s: { _id: string; name: string }) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>

        <div className="flex items-end gap-2">
          <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className="h-11 flex-1 rounded-xl border border-neutral-300 px-3 text-sm">
            <option value="">Item</option>
            {items.map((i: { _id: string; name: string; unit: string }) => <option key={i._id} value={i._id}>{i.name} ({i.unit})</option>)}
          </select>
          <Input type="number" placeholder="Qty" className="w-20" value={qty || ''} onChange={(e) => setQty(Number(e.target.value))} />
          <Input type="number" placeholder="Rate" className="w-24" value={rate || ''} onChange={(e) => setRate(Number(e.target.value))} />
          <Button variant="outline" onClick={addLine}>Add</Button>
        </div>

        <div className="space-y-1">
          {lines.map((l, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5 text-sm">
              <span>{l.quantity} × {l.name} @ {formatCurrency(l.rate)}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatCurrency(l.quantity * l.rate)}</span>
                <button onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}><X className="h-3.5 w-3.5 text-neutral-400" /></button>
              </div>
            </div>
          ))}
        </div>

        {lines.length > 0 && (
          <div className="flex justify-between border-t border-neutral-100 pt-2 font-bold text-ink-900">
            <span>Subtotal</span><span>{formatCurrency(total)}</span>
          </div>
        )}

        <Button className="w-full" disabled={!supplierId || lines.length === 0 || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Saving…' : 'Save as draft'}
        </Button>
        <p className="text-center text-xs text-neutral-400">Stock only increases once you click "Receive stock" on a saved draft.</p>
      </div>
    </Modal>
  );
}
