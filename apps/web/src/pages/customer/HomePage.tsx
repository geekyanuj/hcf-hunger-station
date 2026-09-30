import { useNavigate } from 'react-router-dom';
import { Bike, Package, UtensilsCrossed, MapPin, Clock } from 'lucide-react';
import { useSingleOutlet } from '@/hooks/useSingleOutlet';
import { useCartStore } from '@/stores/cart.store';
import { Card, CardContent, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Outlet, OrderType } from '@/types/domain';
import { deliverySetupPath, useDeliveryReadiness } from '@/hooks/useDeliveryReadiness';

const MODES: { type: OrderType; label: string; icon: typeof Bike; blurb: string }[] = [
  { type: 'DELIVERY', label: 'Delivery', icon: Bike, blurb: 'Get it delivered to your door' },
  { type: 'TAKEAWAY', label: 'Takeaway', icon: Package, blurb: 'Pick up at your convenience' },
];

/** "10:00" -> "10:00 AM", "23:00" -> "11:00 PM". */
function to12h(value: string): string {
  const [h, m] = value.split(':').map(Number);
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Opening hours as one line (HCF Azadnagar uses the same hours every day). */
function hoursLabel(outlet: Outlet): string {
  const open = (outlet.openingHours ?? []).filter((d) => !d.isClosed);
  if (open.length === 0) return '10:00 AM – 11:00 PM';
  return `${to12h(open[0].openTime)} – ${to12h(open[0].closeTime)}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const setOutlet = useCartStore((s) => s.setOutlet);
  const setOrderType = useCartStore((s) => s.setOrderType);

  // HCF runs from a single outlet - there is nothing to choose, so it is selected automatically.
  const { outlet, isLoading } = useSingleOutlet();
  const delivery = useDeliveryReadiness();

  function start(type: OrderType) {
    if (!outlet) return;
    setOutlet(outlet._id);
    setOrderType(type);
    // Delivery needs a signed-in customer with a saved name + address; otherwise collect those first, then continue to the menu.
    if (type === 'DELIVERY' && delivery.status !== 'READY' && delivery.status !== 'LOADING') {
      navigate(deliverySetupPath(delivery.status, '/menu'));
      return;
    }
    navigate('/menu');
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-xl2 bg-gradient-to-br from-brand-600 to-brand-500 px-6 py-10 text-white sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">Welcome to</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">HCF Restaurant</h1>
        <p className="mt-2 max-w-md text-brand-50">
          Fresh burgers, combos and meals — delivered fast or ready for pickup at HCF Azadnagar.
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink-900">Dining in? Scan the table QR code instead</h2>
        <Card className="flex items-center gap-3 p-4">
          <UtensilsCrossed className="h-6 w-6 text-brand-500" />
          <p className="text-sm text-neutral-600">
            Dine-in orders start by scanning the QR code on your table — it automatically links your order to the right
            outlet and table.
          </p>
        </Card>
      </section>

      <section>
        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <h3 className="font-display font-bold text-ink-900">Planning a party or event?</h3>
            <p className="text-sm text-neutral-500">Get a custom catering quotation for birthdays, weddings, and office events.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/party')}>
            Request Catering
          </Button>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink-900">Our outlet</h2>

        {isLoading && <Skeleton className="h-44 max-w-md" />}

        {!isLoading && !outlet && (
          <Card>
            <CardContent className="text-center text-sm text-neutral-500">We're not taking orders right now. Please check back soon.</CardContent>
          </Card>
        )}

        {outlet && (
          <Card className="max-w-md ring-2 ring-brand-500">
            <CardContent className="flex flex-col gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-ink-900">{outlet.name}</h3>
                <p className="mt-1 flex items-start gap-1 text-xs text-neutral-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {outlet.address}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                  <Clock className="h-3.5 w-3.5" /> {hoursLabel(outlet)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                {MODES.map((mode) => (
                  <Button key={mode.type} variant="outline" size="sm" className="flex-col gap-1 py-3" onClick={() => start(mode.type)}>
                    <mode.icon className="h-4 w-4" />
                    {mode.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
