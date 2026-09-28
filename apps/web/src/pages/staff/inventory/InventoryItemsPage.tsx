import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { InventoryApi, SupplierApi } from '@/services/staffApi';
import { Card, CardContent, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';

const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'packet', 'box'];

interface InventoryItemRow {
  _id: string;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
  unit: string;
  minimumStock: number;
  costPerUnit: number;
  stockStatus: string;
}

function statusBadge(status: string) {
  if (status === 'OUT_OF_STOCK') return <Badge variant="warning">Out of stock</Badge>;
  if (status === 'LOW_STOCK') return <Badge variant="warning">Low stock</Badge>;
  return <Badge variant="success">Normal</Badge>;
}

export default function InventoryItemsPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItemRow | null>(null);

  const { data } = useQuery({
    queryKey: ['inventory-items', activeOutletId, search, lowStockOnly],
    queryFn: () => InventoryApi.list(activeOutletId as string, { search: search || undefined, lowStockOnly: lowStockOnly || undefined, limit: 100 }),
    enabled: !!activeOutletId,
  });

  const items: InventoryItemRow[] = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input placeholder="Search ingredients" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => setLowStockOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${lowStockOnly ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-neutral-200 text-neutral-600'}`}
        >
          <SlidersHorizontal className="h-4 w-4" /> Low stock only
        </button>
        <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New item
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Category</th>
                <th className="p-3">Stock</th>
                <th className="p-3">Cost/unit</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-b border-neutral-50">
                  <td className="p-3 font-medium text-ink-900">{item.name}</td>
                  <td className="p-3 text-neutral-500">{item.sku}</td>
                  <td className="p-3 text-neutral-500">{item.category}</td>
                  <td className="p-3">{item.currentStock} {item.unit}</td>
                  <td className="p-3">₹{item.costPerUnit}</td>
                  <td className="p-3">{statusBadge(item.stockStatus)}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setAdjustItem(item)}>
                      Adjust
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-neutral-400">No inventory items yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CreateItemModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        outletId={activeOutletId}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['inventory-items'] })}
      />
      {adjustItem && (
        <AdjustStockModal
          item={adjustItem}
          outletId={activeOutletId as string}
          onClose={() => setAdjustItem(null)}
          onDone={() => queryClient.invalidateQueries({ queryKey: ['inventory-items'] })}
        />
      )}
    </div>
  );
}

function CreateItemModal({
  open,
  onClose,
  outletId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  outletId: string | null;
  onCreated: () => void;
}) {
  const { push } = useToast();
  const [form, setForm] = useState({
    name: '', sku: '', category: '', unit: 'piece', currentStock: 0, minimumStock: 0, maximumStock: 0, reorderLevel: 0, costPerUnit: 0, supplierId: '',
  });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers', outletId], queryFn: () => SupplierApi.list(outletId as string), enabled: !!outletId && open });

  const create = useMutation({
    mutationFn: () => InventoryApi.create({ ...form, outletId, supplierId: form.supplierId || undefined }),
    onSuccess: () => {
      push('Inventory item created', 'success');
      onCreated();
      setForm({ name: '', sku: '', category: '', unit: 'piece', currentStock: 0, minimumStock: 0, maximumStock: 0, reorderLevel: 0, costPerUnit: 0, supplierId: '' });
      onClose();
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="New inventory item">
      <div className="space-y-3">
        <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm">
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <Input type="number" placeholder="Opening stock" value={form.currentStock || ''} onChange={(e) => setForm({ ...form, currentStock: Number(e.target.value) })} />
          <Input type="number" placeholder="Cost per unit (₹)" value={form.costPerUnit || ''} onChange={(e) => setForm({ ...form, costPerUnit: Number(e.target.value) })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input type="number" placeholder="Min stock" value={form.minimumStock || ''} onChange={(e) => setForm({ ...form, minimumStock: Number(e.target.value) })} />
          <Input type="number" placeholder="Max stock" value={form.maximumStock || ''} onChange={(e) => setForm({ ...form, maximumStock: Number(e.target.value) })} />
          <Input type="number" placeholder="Reorder level" value={form.reorderLevel || ''} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} />
        </div>
        {suppliers && suppliers.length > 0 && (
          <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm">
            <option value="">No supplier</option>
            {suppliers.map((s: { _id: string; name: string }) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        )}
        <Button className="w-full" disabled={!form.name || !form.sku || !form.category || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Creating…' : 'Create item'}
        </Button>
      </div>
    </Modal>
  );
}

function AdjustStockModal({
  item,
  outletId,
  onClose,
  onDone,
}: {
  item: InventoryItemRow;
  outletId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [delta, setDelta] = useState(0);
  const [notes, setNotes] = useState('');

  const adjust = useMutation({
    mutationFn: () => InventoryApi.adjustStock(item._id, outletId, delta, notes || undefined),
    onSuccess: () => {
      push('Stock adjusted', 'success');
      onDone();
      onClose();
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  return (
    <Modal open={!!item} onClose={onClose} title={`Adjust stock — ${item.name}`}>
      <div className="space-y-3">
        <p className="text-sm text-neutral-500">Current stock: {item.currentStock} {item.unit}</p>
        <Input type="number" placeholder="Adjustment (+ or -)" value={delta || ''} onChange={(e) => setDelta(Number(e.target.value))} />
        <Input placeholder="Reason / notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button className="w-full" disabled={delta === 0 || adjust.isPending} onClick={() => adjust.mutate()}>
          {adjust.isPending ? 'Saving…' : 'Save adjustment'}
        </Button>
      </div>
    </Modal>
  );
}
