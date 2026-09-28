import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { InventoryApi } from '@/services/staffApi';
import { Card, CardContent, Badge } from '@/components/ui/primitives';
import { cn } from '@/utils/cn';

const TYPES = ['PURCHASE', 'SALE_CONSUMPTION', 'WASTAGE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN'];

const TYPE_COLOR: Record<string, string> = {
  PURCHASE: 'success',
  SALE_CONSUMPTION: 'outline',
  WASTAGE: 'warning',
  ADJUSTMENT: 'outline',
  TRANSFER_IN: 'success',
  TRANSFER_OUT: 'warning',
  RETURN: 'outline',
};

export default function InventoryTransactionsPage() {
  const { activeOutletId } = useStaffOutletStore();
  const [type, setType] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['inventory-ledger', activeOutletId, type],
    queryFn: () => InventoryApi.ledgerForOutlet(activeOutletId as string, { type: type || undefined, limit: 100 }),
    enabled: !!activeOutletId,
  });

  const entries = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setType(null)}
          className={cn('rounded-full border px-3 py-1 text-xs font-medium', !type ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 text-neutral-600')}
        >
          All
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', type === t ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 text-neutral-600')}
          >
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Item</th>
                <th className="p-3">Type</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Before → After</th>
                <th className="p-3">By</th>
                <th className="p-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: {
                _id: string; createdAt: string; type: string; quantity: number; previousStock: number; newStock: number; notes?: string;
                inventoryItemId?: { name: string; unit: string }; userId?: { name: string };
              }) => (
                <tr key={e._id} className="border-b border-neutral-50">
                  <td className="p-3 text-neutral-500">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="p-3 font-medium text-ink-900">{e.inventoryItemId?.name}</td>
                  <td className="p-3"><Badge variant={TYPE_COLOR[e.type] as never}>{e.type.replace('_', ' ')}</Badge></td>
                  <td className={cn('p-3 font-semibold', e.quantity < 0 ? 'text-red-600' : 'text-emerald-600')}>
                    {e.quantity > 0 ? '+' : ''}{e.quantity} {e.inventoryItemId?.unit}
                  </td>
                  <td className="p-3 text-neutral-500">{e.previousStock} → {e.newStock}</td>
                  <td className="p-3 text-neutral-500">{e.userId?.name ?? 'System'}</td>
                  <td className="p-3 text-neutral-400">{e.notes}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-neutral-400">No transactions yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
