import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Bike } from 'lucide-react';
import { Card, CardContent, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { DeliveryDetailsForm } from '@/components/customer/DeliveryDetailsForm';
import { deliverySetupPath, safeNext, useCustomerProfile } from '@/hooks/useDeliveryReadiness';

/**
 * "Name & address" step. Customers are sent here when they choose Delivery (or reach checkout for a delivery
 * order) without a saved name/address. After saving they continue to `?next=` (default: the menu).
 */
export default function DeliveryDetailsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/menu');
  const { isCustomer, data: profile, isLoading, isError, refetch } = useCustomerProfile();

  if (!isCustomer) return <Navigate to={deliverySetupPath('LOGIN_REQUIRED', next)} replace />;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <Bike className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-xl font-bold text-ink-900">Delivery details</h1>
          <p className="text-sm text-neutral-500">Add your name and address first, then place your order.</p>
        </div>
      </div>

      <Card>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          )}
          {isError && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-red-600">We couldn't load your details.</p>
              <Button variant="outline" onClick={() => refetch()}>Try again</Button>
            </div>
          )}
          {profile && <DeliveryDetailsForm profile={profile} onSaved={() => navigate(next, { replace: true })} />}
        </CardContent>
      </Card>

      <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
        Choose takeaway instead
      </Button>
    </div>
  );
}
