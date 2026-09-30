import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { RotateCcw, IndianRupee, ShoppingBag, TrendingUp, Bike, Package, UtensilsCrossed, Store, ChefHat, AlertTriangle, Boxes } from 'lucide-react';
import { useSessionStore } from '@/stores/session.store';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { OutletApi } from '@/services/domainApi';
import { DashboardApi } from '@/services/staffApi';
import { Card, CardContent, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ResetDashboardDialog } from '@/components/staff/ResetDashboardDialog';
import { formatCurrency } from '@/utils/cn';

export default function AdminDashboardPage() {
  const { role, outletIds: myOutletIds } = useSessionStore();
  const canReset = useSessionStore((st) => st.hasPermission('dashboard.reset'));
  const [resetOpen, setResetOpen] = useState(false);
  const { activeOutletId } = useStaffOutletStore();
  const isOwner = role === 'OWNER';
  const [viewAll, setViewAll] = useState(isOwner);

  const { data: outlets } = useQuery({ queryKey: ['outlets'], queryFn: OutletApi.list });
  const myOutlets = outlets?.filter((o) => myOutletIds.length === 0 || myOutletIds.includes(o._id)) ?? [];

  // With a single outlet there is nothing to switch between.
  const showSwitcher = isOwner && myOutlets.length > 1;
  const outletParam = viewAll && showSwitcher ? 'ALL' : activeOutletId ?? '';
  const scopeLabel = outletParam === 'ALL' ? 'all outlets' : myOutlets.find((o) => o._id === outletParam)?.name ?? 'this outlet';

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-overview', outletParam],
    queryFn: () => DashboardApi.overview(outletParam),
    enabled: !!outletParam,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink-900">Admin Dashboard</h1>
        {canReset && (
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={!outletParam}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset dashboard
          </Button>
        )}
        {showSwitcher && (
          <div className="flex gap-1.5 rounded-full border border-neutral-200 p-1">
            <button
              onClick={() => setViewAll(true)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${viewAll ? 'bg-ink-900 text-white' : 'text-neutral-500'}`}
            >
              ALL OUTLETS
            </button>
            {myOutlets.map((o) => (
              <button
                key={o._id}
                onClick={() => setViewAll(false)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!viewAll ? 'bg-ink-900 text-white' : 'text-neutral-500'}`}
              >
                {o.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading && <Skeleton className="h-64" />}

      {data?.lastReset && (
        <p className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          Dashboard was reset by <b>{data.lastReset.by}</b> on {new Date(data.lastReset.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. Figures below count from then;
          Analytics still shows full history.
        </p>
      )}

      {canReset && <ResetDashboardDialog open={resetOpen} onClose={() => setResetOpen(false)} outletParam={outletParam} scopeLabel={scopeLabel} />}

      {data && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">Today's Overview</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard icon={IndianRupee} label="Sales" value={formatCurrency(data.todaysOverview.sales)} color="text-emerald-600" />
              <StatCard icon={ShoppingBag} label="Orders" value={String(data.todaysOverview.orders)} color="text-brand-600" />
              <StatCard icon={TrendingUp} label="Avg Order Value" value={formatCurrency(data.todaysOverview.averageOrderValue)} color="text-indigo-600" />
              <StatCard icon={Store} label="POS Orders" value={String(data.todaysOverview.posOrders)} color="text-neutral-600" />
              <StatCard icon={UtensilsCrossed} label="Dine" value={String(data.todaysOverview.dineInOrders)} color="text-amber-600" />
              <StatCard icon={Package} label="Take" value={String(data.todaysOverview.takeawayOrders)} color="text-cyan-600" />
              <StatCard icon={Bike} label="Parcel" value={String(data.todaysOverview.deliveryOrders)} color="text-rose-600" />
              <StatCard icon={ChefHat} label="Catering" value={String(data.todaysOverview.cateringOrders)} color="text-purple-600" />
            </div>
          </section>

          {data.kitchen && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">Kitchen</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard icon={ChefHat} label="Active Orders" value={String(data.kitchen.activeOrders)} color="text-brand-600" />
                <StatCard icon={ChefHat} label="Pending" value={String(data.kitchen.pendingOrders)} color="text-amber-600" />
                <StatCard icon={AlertTriangle} label="Delayed" value={String(data.kitchen.delayedOrders)} color="text-red-600" />
                <StatCard icon={TrendingUp} label="Avg Prep Time" value={`${data.kitchen.averagePreparationMinutes} min`} color="text-neutral-600" />
              </div>
            </section>
          )}

          {data.inventory && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">Inventory</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard icon={AlertTriangle} label="Low Stock" value={String(data.inventory.lowStockCount)} color="text-amber-600" />
                <StatCard icon={AlertTriangle} label="Out of Stock" value={String(data.inventory.outOfStockCount)} color="text-red-600" />
                <StatCard icon={Boxes} label="Inventory Value" value={formatCurrency(data.inventory.totalInventoryValue)} color="text-emerald-600" />
              </div>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent>
                <h2 className="mb-3 font-display font-bold text-ink-900">Revenue — Last 7 Days</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.sales.revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Line type="monotone" dataKey="revenue" stroke="#e8590c" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent>
                  <p className="text-xs text-neutral-500">Best-selling item</p>
                  <p className="font-display text-lg font-bold text-ink-900">{data.sales.bestSellingItem?.name ?? '—'}</p>
                  {data.sales.bestSellingItem && (
                    <p className="text-xs text-neutral-400">{data.sales.bestSellingItem.quantitySold} sold</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-xs text-neutral-500">Best category</p>
                  <p className="font-display text-lg font-bold text-ink-900">{data.sales.bestCategory?.categoryName ?? '—'}</p>
                  {data.sales.bestCategory && (
                    <p className="text-xs text-neutral-400">{formatCurrency(data.sales.bestCategory.revenue)} revenue</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof IndianRupee; label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <Icon className={`h-7 w-7 ${color}`} />
        <div>
          <p className="text-xs text-neutral-500">{label}</p>
          <p className="font-display text-base font-bold text-ink-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
