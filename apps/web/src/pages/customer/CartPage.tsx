import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/stores/cart.store';
import { OrderApi } from '@/services/domainApi';
import { Card, CardContent, Skeleton, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/utils/cn';
import { useState } from 'react';
import { deliverySetupPath, useDeliveryReadiness } from '@/hooks/useDeliveryReadiness';

export default function CartPage() {
  const navigate = useNavigate();
  const { outletId, orderType, lines, updateQuantity, removeLine, couponCode, applyCoupon } = useCartStore();
  const [couponInput, setCouponInput] = useState(couponCode ?? '');
  const delivery = useDeliveryReadiness();

  function proceed() {
    // Delivery orders need a saved name + address first; send the customer there, then bring them back to checkout.
    if (orderType === 'DELIVERY' && (delivery.status === 'LOGIN_REQUIRED' || delivery.status === 'DETAILS_REQUIRED')) {
      navigate(deliverySetupPath(delivery.status, '/checkout'));
      return;
    }
    navigate('/checkout');
  }

  const { data: priced, isLoading, isError } = useQuery({
    queryKey: ['price-cart', outletId, orderType, lines, couponCode],
    queryFn: () => OrderApi.priceCart(outletId as string, orderType, lines, couponCode ?? undefined),
    enabled: !!outletId && lines.length > 0,
  });

  if (!outletId || lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShoppingBag className="h-12 w-12 text-neutral-300" />
        <h1 className="font-display text-xl font-bold text-ink-900">Your cart is empty</h1>
        <p className="text-sm text-neutral-500">Add some delicious items from the menu to get started.</p>
        <Button className="mt-2" onClick={() => navigate('/')}>
          Browse menu
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <h1 className="font-display text-2xl font-bold text-ink-900">Your Cart</h1>
        {lines.map((line, index) => (
          <Card key={`${line.menuItemId}-${index}`}>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-ink-900">{line.name}</h3>
                {line.selectedOptionLabels.length > 0 && (
                  <p className="text-xs text-neutral-500">{line.selectedOptionLabels.join(', ')}</p>
                )}
                {line.notes && <p className="text-xs italic text-neutral-400">"{line.notes}"</p>}
                <p className="mt-1 text-sm font-semibold text-brand-600">{formatCurrency(line.unitPrice)}</p>
              </div>
              <div className="flex items-center gap-3 rounded-full border border-neutral-200 px-2 py-1">
                <button onClick={() => updateQuantity(index, line.quantity - 1)} className="rounded-full p-1.5 hover:bg-neutral-100">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-5 text-center text-sm font-semibold">{line.quantity}</span>
                <button onClick={() => updateQuantity(index, line.quantity + 1)} className="rounded-full p-1.5 hover:bg-neutral-100">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button onClick={() => removeLine(index)} className="text-neutral-400 hover:text-red-500" aria-label="Remove item">
                <Trash2 className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-display font-bold text-ink-900">Order Summary</h2>

            <div className="flex gap-2">
              <Input placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} />
              <Button variant="outline" onClick={() => applyCoupon(couponInput || null)}>
                Apply
              </Button>
            </div>

            {isLoading && <Skeleton className="h-32" />}
            {isError && <p className="text-sm text-red-500">Couldn't price your cart. Please try again.</p>}

            {priced && (
              <div className="space-y-1.5 border-t border-neutral-100 pt-3 text-sm">
                <Row label="Subtotal" value={priced.subtotal} />
                {priced.discount > 0 && <Row label="Discount" value={-priced.discount} highlight="text-emerald-600" />}
                <Row label="Tax" value={priced.tax} />
                {priced.packagingCharge > 0 && <Row label="Packaging" value={priced.packagingCharge} />}
                {priced.deliveryCharge > 0 && <Row label="Delivery" value={priced.deliveryCharge} />}
                <div className="flex justify-between border-t border-neutral-100 pt-2 font-bold text-ink-900">
                  <span>Total</span>
                  <span>{formatCurrency(priced.total)}</span>
                </div>
              </div>
            )}

            {orderType === 'DELIVERY' && delivery.status !== 'READY' && delivery.status !== 'LOADING' && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {delivery.status === 'LOGIN_REQUIRED' ? 'Sign in and add your delivery address to continue.' : 'Add your name and delivery address to continue.'}
              </p>
            )}

            <Button className="w-full" disabled={!priced || (orderType === 'DELIVERY' && delivery.status === 'LOADING')} onClick={proceed}>
              {orderType === 'DELIVERY' && delivery.status === 'LOGIN_REQUIRED'
                ? 'Sign in to continue'
                : orderType === 'DELIVERY' && delivery.status === 'DETAILS_REQUIRED'
                  ? 'Add delivery address'
                  : 'Proceed to Checkout'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: number; highlight?: string }) {
  return (
    <div className={`flex justify-between text-neutral-600 ${highlight ?? ''}`}>
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}
