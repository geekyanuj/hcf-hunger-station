import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { useSessionStore } from '@/stores/session.store';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { OutletApi } from '@/services/domainApi';
import { AnalyticsApi } from '@/services/staffApi';
import { Card, CardContent } from '@/components/ui/primitives';
import { formatCurrency } from '@/utils/cn';
import { cn } from '@/utils/cn';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 days' },
  { value: 'last30days', label: 'Last 30 days' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

const COLORS = ['#e8590c', '#1a1210', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b'];

function ChartEmptyState({ message }: { message: string }) {
  return <div className="flex h-[260px] items-center justify-center text-sm text-neutral-400">{message}</div>;
}

export default function AnalyticsPage() {
  const { role, outletIds } = useSessionStore();
  const { activeOutletId } = useStaffOutletStore();
  const [range, setRange] = useState('last7days');
  const [outletFilter, setOutletFilter] = useState('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const isOwner = role === 'OWNER';
  const { data: outlets } = useQuery({ queryKey: ['outlets'], queryFn: OutletApi.list });
  const availableOutlets = outlets?.filter((outlet) => outletIds.length === 0 || outletIds.includes(outlet._id)) ?? [];
  const outletId = isOwner ? outletFilter : activeOutletId ?? '';
  const customRangeReady = range !== 'custom' || (!!customFrom && !!customTo && customFrom <= customTo);
  const params = range === 'custom' && customRangeReady
    ? { outletId, from: customFrom, to: customTo }
    : { range, outletId };

  const downloadReport = async () => {
    if (!outletId) {
      setDownloadError('Select an outlet before downloading the report.');
      return;
    }
    if (range === 'custom' && (!customFrom || !customTo)) {
      setDownloadError('Choose both the start date and end date.');
      return;
    }
    if (range === 'custom' && customFrom > customTo) {
      setDownloadError('The start date must be on or before the end date.');
      return;
    }
    setDownloading(true);
    setDownloadError('');
    try {
      await AnalyticsApi.downloadReport(params);
    } catch {
      setDownloadError('Could not download the Analytics report. Please try again or contact your administrator.');
    } finally {
      setDownloading(false);
    }
  };

  const queryEnabled = !!outletId && customRangeReady;
  const revenueQuery = useQuery({ queryKey: ['a-revenue', params], queryFn: () => AnalyticsApi.revenueOverTime(params), enabled: queryEnabled });
  const orderTypesQuery = useQuery({ queryKey: ['a-types', params], queryFn: () => AnalyticsApi.orderTypeDistribution(params), enabled: queryEnabled });
  const topProductsQuery = useQuery({ queryKey: ['a-products', params], queryFn: () => AnalyticsApi.topProducts(params), enabled: queryEnabled });
  const categoriesQuery = useQuery({ queryKey: ['a-categories', params], queryFn: () => AnalyticsApi.categoryPerformance(params), enabled: queryEnabled });
  const paymentsQuery = useQuery({ queryKey: ['a-payments', params], queryFn: () => AnalyticsApi.paymentMethods(params), enabled: queryEnabled });
  const purchasesQuery = useQuery({ queryKey: ['a-purchases', params], queryFn: () => AnalyticsApi.purchaseTrend(params), enabled: queryEnabled });
  const foodCostQuery = useQuery({ queryKey: ['a-foodcost', params], queryFn: () => AnalyticsApi.foodCost(params), enabled: queryEnabled });
  const wastageQuery = useQuery({ queryKey: ['a-wastage', params], queryFn: () => AnalyticsApi.wastageTrend(params), enabled: queryEnabled });
  const outletPerfQuery = useQuery({
    queryKey: ['a-outlet-perf', params],
    queryFn: () => AnalyticsApi.outletPerformance(params),
    enabled: queryEnabled && isOwner,
  });
  const staffPerfQuery = useQuery({ queryKey: ['a-staff-perf', params], queryFn: () => AnalyticsApi.staffPerformance(params), enabled: queryEnabled });

  const revenue = revenueQuery.data;
  const orderTypes = orderTypesQuery.data;
  const topProducts = topProductsQuery.data;
  const categories = categoriesQuery.data;
  const payments = paymentsQuery.data;
  const purchases = purchasesQuery.data;
  const foodCost = foodCostQuery.data;
  const wastage = wastageQuery.data;
  const outletPerf = outletPerfQuery.data;
  const staffPerf = staffPerfQuery.data;
  const analyticsQueries = [
    revenueQuery, orderTypesQuery, topProductsQuery, categoriesQuery, paymentsQuery,
    purchasesQuery, foodCostQuery, wastageQuery, staffPerfQuery,
    ...(isOwner ? [outletPerfQuery] : []),
  ];
  const isLoading = analyticsQueries.some((query) => query.isLoading);
  const hasError = analyticsQueries.some((query) => query.isError);
  const totalRevenue = (revenue ?? []).reduce((sum: number, item: { revenue: number }) => sum + Number(item.revenue || 0), 0);
  const totalOrders = (revenue ?? []).reduce((sum: number, item: { orders: number }) => sum + Number(item.orders || 0), 0);
  const outletLabel = isOwner && outletId === 'ALL'
    ? 'all outlets'
    : availableOutlets.find((outlet) => outlet._id === outletId)?.name ?? 'selected outlet';
  const periodLabel = range === 'custom'
    ? customRangeReady ? `${customFrom} – ${customTo}` : 'Select a custom date range'
    : RANGES.find((item) => item.value === range)?.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Analytics</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Sales and operations for {outletLabel} · {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Outlet
              <select
                value={outletFilter}
                onChange={(event) => { setOutletFilter(event.target.value); setDownloadError(''); }}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-ink-900"
              >
                <option value="ALL">All outlets</option>
                {availableOutlets.map((outlet) => (
                  <option key={outlet._id} value={outlet._id}>{outlet.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-1.5 rounded-full border border-neutral-200 p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => { setRange(r.value); setDownloadError(''); }}
                className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', range === r.value ? 'bg-ink-900 text-white' : 'text-neutral-500')}
                aria-pressed={range === r.value}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={downloadReport}
            disabled={downloading || !outletId || !customRangeReady}
            className="rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? 'Preparing report…' : 'Download report (CSV)'}
          </button>
        </div>
      </div>

      {range === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 p-4">
          <label className="flex flex-col gap-1 text-sm text-neutral-600">
            Start date
            <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => { setCustomFrom(e.target.value); setDownloadError(''); }} className="rounded-lg border border-neutral-300 px-3 py-2 text-ink-900" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-600">
            End date
            <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => { setCustomTo(e.target.value); setDownloadError(''); }} className="rounded-lg border border-neutral-300 px-3 py-2 text-ink-900" />
          </label>
          <p className="text-xs text-neutral-500">Analytics includes the full start and end dates.</p>
          {customFrom && customTo && customFrom > customTo && (
            <p role="alert" className="text-sm text-red-700">The start date must be on or before the end date.</p>
          )}
          {(!customFrom || !customTo) && <p className="text-xs text-amber-700">Choose both dates to load analytics.</p>}
        </div>
      )}
      {downloadError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{downloadError}</p>}
      {!outletId && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Select an outlet to view analytics.</p>}
      {isLoading && queryEnabled && <p role="status" className="text-sm text-neutral-500">Loading analytics for the selected filters…</p>}
      {hasError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>Some analytics could not be loaded. Check your connection or permissions.</span>
          <button
            type="button"
            onClick={() => analyticsQueries.forEach((query) => { void query.refetch(); })}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {foodCost && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card><CardContent><p className="text-xs text-neutral-500">Revenue</p><p className="font-display text-lg font-bold">{formatCurrency(totalRevenue)}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-neutral-500">Orders</p><p className="font-display text-lg font-bold">{totalOrders.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-neutral-500">Average Order Value</p><p className="font-display text-lg font-bold">{formatCurrency(totalOrders ? totalRevenue / totalOrders : 0)}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-neutral-500">Food Cost (approx.)</p><p className="font-display text-lg font-bold">{formatCurrency(foodCost.totalFoodCost)}</p><p className="text-xs text-neutral-500">{foodCost.foodCostPercent}% of revenue</p></CardContent></Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Revenue Over Time</h2>
            {revenue?.length ? <ResponsiveContainer width="100%" height={260}>
              <LineChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: number) => formatCurrency(value)} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="revenue" stroke="#e8590c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer> : <ChartEmptyState message="No revenue recorded for this period." />}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Order Type Distribution</h2>
            {orderTypes?.length ? <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={orderTypes} dataKey="count" nameKey="orderType" cx="50%" cy="50%" outerRadius={90} label>
                  {(orderTypes ?? []).map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer> : <ChartEmptyState message="No orders recorded for this period." />}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Top Products</h2>
            {topProducts?.length ? <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="quantitySold" fill="#e8590c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer> : <ChartEmptyState message="No product sales for this period." />}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 font-display font-bold text-ink-900">Category Performance</h2>
            {categories?.length ? <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categories}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="categoryName" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#1a1210" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer> : <ChartEmptyState message="No category sales for this period." />}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-1 font-display font-bold text-ink-900">Wastage Trend</h2>
            <p className="mb-3 text-xs text-neutral-500">Estimated value of recorded wastage.</p>
            {wastage?.length ? <ResponsiveContainer width="100%" height={220}>
              <LineChart data={wastage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: number) => formatCurrency(value)} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer> : <ChartEmptyState message="No wastage recorded for this period." />}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-1 font-display font-bold text-ink-900">Payment Methods</h2>
            <p className="mb-3 text-xs text-neutral-500">Successful payment transactions in the selected period.</p>
            {payments?.length ? <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={payments} dataKey="total" nameKey="method" cx="50%" cy="50%" outerRadius={80} label>
                  {payments.map((_: unknown, index: number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer> : <ChartEmptyState message="No successful payments for this period." />}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-1 font-display font-bold text-ink-900">Purchases Over Time</h2>
            <p className="mb-3 text-xs text-neutral-500">Completed supplier purchases by purchase date.</p>
            {purchases?.length ? <ResponsiveContainer width="100%" height={220}>
              <BarChart data={purchases}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: number) => formatCurrency(value)} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer> : <ChartEmptyState message="No completed purchases for this period." />}
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
              <h2 className="mb-1 font-display font-bold text-ink-900">Staff Performance</h2>
              <p className="mb-3 text-xs text-neutral-500">Orders are attributed to the assigned delivery staff member, or otherwise to the staff member who created them.</p>
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
