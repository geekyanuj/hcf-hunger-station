import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { OrderApi } from '@/services/domainApi';
import { useCartStore } from '@/stores/cart.store';
import { Card, CardContent, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/utils/cn';
import { extractErrorMessage } from '@/services/apiClient';
import { CreditCard, Wallet, Smartphone, Banknote, Clock, UtensilsCrossed, MapPin } from 'lucide-react';
import { deliverySetupPath, useDeliveryReadiness } from '@/hooks/useDeliveryReadiness';
import { cn } from '@/utils/cn';

const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash', icon: Banknote },
  { id: 'UPI', label: 'UPI', icon: Smartphone },
  { id: 'CARD', label: 'Card', icon: CreditCard },
  { id: 'ONLINE', label: 'Online', icon: Wallet },
] as const;

/** Dine-in guests may also settle after the meal; staff then record the payment (payment stays PENDING until then). */
const PAY_AFTER_DINE_IN = { id: 'PAY_AFTER_DINE_IN', label: 'Pay After Dine In', icon: UtensilsCrossed } as const;
type MethodId = (typeof PAYMENT_METHODS)[number]['id'] | typeof PAY_AFTER_DINE_IN.id;

function defaultScheduleTime(): string {
  const d = new Date(Date.now() + 60 * 60000); // default to 1 hour from now
  return d.toISOString().slice(0, 16);
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { outletId, orderType, lines, tableQrToken, couponCode, clear } = useCartStore();
  const delivery = useDeliveryReadiness();
  const addresses = delivery.profile?.addresses ?? [];
  const [pickedAddressId, setPickedAddressId] = useState<string | null>(null);
  // Chosen address: the one picked here, else the saved default.
  const address = addresses.find((a) => a._id === pickedAddressId) ?? addresses.find((a) => a._id === delivery.profile?.delivery.defaultAddressId) ?? addresses[0];
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<MethodId>('CASH');
  const [scheduleMode, setScheduleMode] = useState<'ASAP' | 'SCHEDULED'>('ASAP');
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleTime());

  const { data: priced } = useQuery({
    queryKey: ['price-cart-checkout', outletId, orderType, lines, couponCode],
    queryFn: () => OrderApi.priceCart(outletId as string, orderType, lines, couponCode ?? undefined),
    enabled: !!outletId && lines.length > 0,
  });

  const createOrder = useMutation({
    mutationFn: () =>
      OrderApi.create({
        outletId: outletId as string,
        orderType,
        lines,
        tableQrToken: orderType === 'DINE_IN' ? tableQrToken ?? undefined : undefined,
        // Pay After Dine In is only valid for dine-in orders; make sure a stale selection can never leak into another type.
        paymentMethod: method === 'PAY_AFTER_DINE_IN' && orderType !== 'DINE_IN' ? undefined : method,
        couponCode: couponCode ?? undefined,
        deliveryAddress:
          orderType === 'DELIVERY' && address
            ? { line1: address.line1, line2: address.line2, city: address.city, state: address.state, pincode: address.pincode }
            : undefined,
        customerNotes: notes || undefined,
        scheduledAt: scheduleMode === 'SCHEDULED' ? new Date(scheduledAt).toISOString() : undefined,
      }),
    onSuccess: (order) => {
      clear();
      push(`Order placed! Your token is ${order.tokenNumber}`, 'success');
      navigate(`/track/${order._id}`);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const isDeliveryValid = orderType !== 'DELIVERY' || (delivery.status === 'READY' && !!address);

  // Delivery needs a signed-in customer with a saved name + address: collect them first, then return here.
  if (orderType === 'DELIVERY' && (delivery.status === 'LOGIN_REQUIRED' || delivery.status === 'DETAILS_REQUIRED')) {
    return <Navigate to={deliverySetupPath(delivery.status, '/checkout')} replace />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <h1 className="font-display text-2xl font-bold text-ink-900">Checkout</h1>

        {orderType !== 'DINE_IN' && (
          <Card>
            <CardContent className="space-y-3">
              <h2 className="flex items-center gap-1.5 font-semibold text-ink-900"><Clock className="h-4 w-4" /> When do you want it?</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setScheduleMode('ASAP')}
                  className={cn('flex-1 rounded-xl border p-3 text-sm font-semibold', scheduleMode === 'ASAP' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600')}
                >
                  ASAP
                </button>
                <button
                  onClick={() => setScheduleMode('SCHEDULED')}
                  className={cn('flex-1 rounded-xl border p-3 text-sm font-semibold', scheduleMode === 'SCHEDULED' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600')}
                >
                  Schedule for later
                </button>
              </div>
              {scheduleMode === 'SCHEDULED' && (
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={defaultScheduleTime()} />
              )}
            </CardContent>
          </Card>
        )}

        {orderType === 'DELIVERY' && (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink-900">Delivery Address</h2>
                <Link to={`/delivery-details?next=${encodeURIComponent('/checkout')}`} className="text-xs font-semibold text-brand-600 hover:underline">
                  Change / add address
                </Link>
              </div>
              {delivery.status === 'LOADING' && <p className="text-sm text-neutral-500">Loading your saved address…</p>}
              {delivery.profile && (
                <p className="text-sm text-neutral-600">
                  Delivering to <span className="font-semibold text-ink-900">{delivery.profile.name}</span> · {delivery.profile.mobile}
                </p>
              )}
              <div className="space-y-2">
                {addresses.map((a) => (
                  <button
                    key={a._id}
                    type="button"
                    onClick={() => setPickedAddressId(a._id ?? null)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-xl border p-3 text-left text-sm',
                      address?._id === a._id ? 'border-brand-500 bg-brand-50' : 'border-neutral-200'
                    )}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span className="text-neutral-700">{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {orderType === 'DINE_IN' && (
          <Card>
            <CardContent>
              <h2 className="font-semibold text-ink-900">Dine-in</h2>
              <p className="text-sm text-neutral-500">Your order will be served directly to your table.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-semibold text-ink-900">Payment Method</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(orderType === 'DINE_IN' ? [...PAYMENT_METHODS, PAY_AFTER_DINE_IN] : PAYMENT_METHODS).map((pm) => (
                <button
                  key={pm.id}
                  onClick={() => setMethod(pm.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium ${
                    method === pm.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600'
                  }`}
                >
                  <pm.icon className="h-5 w-5" />
                  {pm.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-2 font-semibold text-ink-900">Notes for the kitchen</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-20 w-full resize-none rounded-xl border border-neutral-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="Any special requests?"
            />
          </CardContent>
        </Card>
      </div>

      <div>
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-display font-bold text-ink-900">Total</h2>
            {priced && (
              <div className="space-y-1 text-sm text-neutral-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(priced.subtotal)}</span>
                </div>
                {priced.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(priced.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-ink-900">
                  <span>Total</span>
                  <span>{formatCurrency(priced.total)}</span>
                </div>
              </div>
            )}
            <Button
              className="w-full"
              disabled={!isDeliveryValid || createOrder.isPending || !priced}
              onClick={() => createOrder.mutate()}
            >
              {createOrder.isPending ? 'Placing order…' : `Place order · ${priced ? formatCurrency(priced.total) : ''}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
