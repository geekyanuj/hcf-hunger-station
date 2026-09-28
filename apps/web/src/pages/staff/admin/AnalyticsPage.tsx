import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { useSessionStore } from '@/stores/session.store';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { AnalyticsApi } from '@/services/staffApi';
import { Card, CardContent } from '@/components/ui/primitives';
import { formatCurrency } from '@/utils/cn';
import { cn } from '@/utils/cn';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 days' },
  { value: 'last30days', label: 'Last 30 days' },
];

const COLORS = ['#e8590c', '#1a1210', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b'];

export default function AnalyticsPage() {
  const { role } = useSessionStore();
  const { activeOutletId } = useStaffOutletStore();
  const [range, setRange] = useState('last7days');
  const outletId = role === 'OWNER' ? 'ALL' : activeOutletId ?? '';
  const params = { range, outletId };

  const { data: revenue } = useQuery({ queryKey: ['a-revenue', params], queryFn: () => AnalyticsApi.revenueOverTime(params), enabled: !!outletId });
  const { data: orderTypes } = useQuery({ queryKey: ['a-types', params], queryFn: () => AnalyticsApi.orderTypeDistribution(params), enabled: !!outletId });
  const { data: topProducts } = useQuery({ queryKey: ['a-products', params], queryFn: () => AnalyticsApi.topProducts(params), enabled: !!outletId });
  const { data: categories } = useQuery({ queryKey: ['a-categories', params], queryFn: () => AnalyticsApi.categoryPerformance(params), enabled: !!outletId });
  const { data: foodCost } = useQuery({ queryKey: ['a-foodcost', params], queryFn: () => AnalyticsApi.foodCost(params), enabled: !!outletId });
  const { data: wastage } = useQuery({ queryKey: ['a-wastage', params], queryFn: () => AnalyticsApi.wastageTrend(params), enabled: !!outletId });
  const { data: outletPerf } = useQuery({
    queryKey: ['a-outlet-perf', params],
    queryFn: () => AnalyticsApi.outletPerformance(params),
    enabled: !!outletId && role === 'OWNER',
  });
  const { data: staffPerf } = useQuery({ queryKey: ['a-staff-perf', params], queryFn: () => AnalyticsApi.staffPerformance(params), enabled: !!outletId });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink-900">Analytics</h1>
        <div className="flex gap-1.5 rounded-full border border-neutral-200 p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', range === r.value ? 'bg-ink-900 text-white' : 'text-neutral-500')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {foodCost && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent><p className="text-xs text-neutral-500">Revenue</p><p className="font-display text-lg font-bold">{formatCurrency(foodCost.totalRevenue)}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-neutral-500">Food Cost</p><p className="font-display text-lg font-bold">{formatCurrency(foodCost.totalFoodCost)}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-neutral-500">Food Cost %</p><p className="font-display text-lg font-bold text-amber-600">{foodCost.foodCostPercent}%</p></CardContent></Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Revenue Over Time</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="revenue" stroke="#e8590c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Order Type Distribution</h2>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={orderTypes} dataKey="count" nameKey="orderType" cx="50%" cy="50%" outerRadius={90} label>
                  {(orderTypes ?? []).map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Top Products</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="quantitySold" fill="#e8590c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Category Performance</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categories}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="categoryName" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#1a1210" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Wastage Trend</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={wastage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {outletPerf && outletPerf.length > 0 && (
          <Card>
            <CardContent>
              <h2 className="mb-3 font-display font-bold text-ink-900">Outlet Performance</h2>
              <div className="space-y-2">
                {outletPerf.map((o: { outletId: string; outletName: string; revenue: number; orders: number }) => (
                  <div key={o.outletId} className="flex justify-between text-sm">
                    <span>{o.outletName}</span>
                    <span className="font-medium">{formatCurrency(o.revenue)} · {o.orders} orders</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {staffPerf && staffPerf.length > 0 && (
          <Card>
            <CardContent>
              <h2 className="mb-3 font-display font-bold text-ink-900">Staff Performance</h2>
              <div className="space-y-2">
                {staffPerf.map((s: { userId: string; name: string; role: string; ordersHandled: number; revenue: number }) => (
                  <div key={s.userId} className="flex justify-between text-sm">
                    <span>{s.name} <span className="text-neutral-400">({s.role})</span></span>
                    <span className="font-medium">{s.ordersHandled} orders · {formatCurrency(s.revenue)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
