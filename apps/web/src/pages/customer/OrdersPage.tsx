import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CustomerApi } from '@/services/domainApi';
import { useSessionStore } from '@/stores/session.store';
import { Card, CardContent, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/utils/cn';
import { Order } from '@/types/domain';
import { ClipboardList } from 'lucide-react';
import { customerStatusLabel, STATUS_BADGE_CLASS } from '@/utils/orderStatus';
import { cn } from '@/utils/cn';

export default function OrdersPage() {
  const navigate = useNavigate();
  const { accessToken, principalType } = useSessionStore();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: CustomerApi.myOrders,
    enabled: !!accessToken && principalType === 'CUSTOMER',
  });

  if (!accessToken || principalType !== 'CUSTOMER') {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <ClipboardList className="h-10 w-10 text-neutral-300" />
        <p className="text-neutral-500">Log in to see your order history.</p>
        <Button onClick={() => navigate('/account')}>Login</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-2xl font-bold text-ink-900">Your Orders</h1>
      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {orders?.map((order: Order) => (
        <Card key={order._id}>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink-900">{order.orderNumber} · {order.tokenNumber}</p>
              <p className="text-xs text-neutral-500">{new Date(order.createdAt).toLocaleString()}</p>
              <Badge variant="outline" className={cn('mt-1 border-transparent', STATUS_BADGE_CLASS[order.orderStatus])}>
                {customerStatusLabel(order.orderStatus, order.orderType)}
              </Badge>
            </div>
            <div className="text-right">
              <p className="font-bold text-ink-900">{formatCurrency(order.total)}</p>
              <Button size="sm" variant="outline" className="mt-1" onClick={() => navigate(`/track/${order._id}`)}>
                Track
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
