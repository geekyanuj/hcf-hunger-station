import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AlertTriangle, XCircle, IndianRupee, TrendingDown, ShoppingCart, Trash } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { InventoryDashboardApi } from '@/services/staffApi';
import { getStaffSocket } from '@/services/socketClient';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, Badge } from '@/components/ui/primitives';
import { formatCurrency } from '@/utils/cn';
import { useToast } from '@/components/ui/Toast';

export default function InventoryDashboardPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const { push } = useToast();

  const { data } = useQuery({
    queryKey: ['inventory-dashboard', activeOutletId],
    queryFn: () => InventoryDashboardApi.summary(activeOutletId as string),
    enabled: !!activeOutletId,
  });

  useEffect(() => {
    if (!activeOutletId) return;
    const socket = getStaffSocket();
    socket.emit('staff:subscribe', activeOutletId);
    const onLow = (p: { name: string; currentStock: number; unit: string }) => {
      push(`Low stock: ${p.name} (${p.currentStock} ${p.unit} left)`, 'error');
      queryClient.invalidateQueries({ queryKey: ['inventory-dashboard', activeOutletId] });
    };
    const onOut = (p: { name: string }) => {
      push(`Out of stock: ${p.name}`, 'error');
      queryClient.invalidateQueries({ queryKey: ['inventory-dashboard', activeOutletId] });
    };
    socket.on('inventory:low', onLow);
    socket.on('inventory:out', onOut);
    return () => {
      socket.off('inventory:low', onLow);
      socket.off('inventory:out', onOut);
    };
  }, [activeOutletId, push, queryClient]);

  if (!activeOutletId) return <p className="text-neutral-500">Select an outlet.</p>;
  if (!data) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={IndianRupee} label="Inventory value" value={formatCurrency(data.totalInventoryValue)} color="text-emerald-600" />
        <StatCard icon={AlertTriangle} label="Low stock items" value={String(data.lowStockCount)} color="text-amber-600" />
        <StatCard icon={XCircle} label="Out of stock" value={String(data.outOfStockCount)} color="text-red-600" />
        <StatCard icon={TrendingDown} label="Wastage (30d)" value={formatCurrency(data.wastageValueLast30Days)} color="text-neutral-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Low & Out of Stock</h2>
            <div className="space-y-2">
              {data.lowStockItems.length === 0 && <p className="text-sm text-neutral-400">All items above minimum stock.</p>}
              {data.lowStockItems.map((item: { _id: string; name: string; currentStock: number; unit: string; minimumStock: number }) => (
                <div key={item._id} className="flex items-center justify-between text-sm">
                  <span>{item.name}</span>
                  <Badge variant={item.currentStock <= 0 ? 'warning' : 'outline'}>
                    {item.currentStock} / min {item.minimumStock} {item.unit}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-ink-900">
              <ShoppingCart className="h-4 w-4" /> Recent Purchases
            </h2>
            <div className="space-y-2 text-sm">
              {data.recentPurchases.length === 0 && <p className="text-neutral-400">No purchases yet.</p>}
              {data.recentPurchases.map((p: { _id: string; purchaseNumber: string; total: number; status: string; supplierId?: { name: string } }) => (
                <div key={p._id} className="flex items-center justify-between">
                  <span>{p.purchaseNumber} — {p.supplierId?.name}</span>
                  <span className="font-medium">{formatCurrency(p.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-ink-900">
              <Trash className="h-4 w-4" /> Recent Wastage
            </h2>
            <div className="space-y-2 text-sm">
              {data.recentWastage.length === 0 && <p className="text-neutral-400">No wastage recorded.</p>}
              {data.recentWastage.map((w: { _id: string; inventoryItemId?: { name: string }; quantity: number; reason: string; estimatedValue: number }) => (
                <div key={w._id} className="flex items-center justify-between">
                  <span>{w.inventoryItemId?.name} — {w.quantity} ({w.reason})</span>
                  <span className="font-medium text-red-600">{formatCurrency(w.estimatedValue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Top Consumed Ingredients (30d)</h2>
            <div className="space-y-2 text-sm">
              {(!data.topConsumedIngredients || data.topConsumedIngredients.length === 0) && (
                <p className="text-neutral-400">No consumption recorded yet.</p>
              )}
              {data.topConsumedIngredients?.map((c: { name: string; unit: string; totalConsumed: number }, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <span>{c.name}</span>
                  <span className="font-medium">{c.totalConsumed.toFixed(2)} {c.unit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof IndianRupee; label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <Icon className={`h-8 w-8 ${color}`} />
        <div>
          <p className="text-xs text-neutral-500">{label}</p>
          <p className="font-display text-lg font-bold text-ink-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
