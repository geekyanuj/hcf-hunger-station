import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bike, Package, UtensilsCrossed, MapPin, Clock } from 'lucide-react';
import { OutletApi } from '@/services/domainApi';
import { useCartStore } from '@/stores/cart.store';
import { Card, CardContent, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { OrderType } from '@/types/domain';

const MODES: { type: OrderType; label: string; icon: typeof Bike; blurb: string }[] = [
  { type: 'DELIVERY', label: 'Delivery', icon: Bike, blurb: 'Get it delivered to your door' },
  { type: 'TAKEAWAY', label: 'Takeaway', icon: Package, blurb: 'Pick up at your convenience' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const setOutlet = useCartStore((s) => s.setOutlet);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const outletId = useCartStore((s) => s.outletId);

  const { data: outlets, isLoading } = useQuery({ queryKey: ['outlets'], queryFn: OutletApi.list });

  function chooseOutletAndMode(id: string, type: OrderType) {
    setOutlet(id);
    setOrderType(type);
    navigate('/menu');
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-xl2 bg-gradient-to-br from-brand-600 to-brand-500 px-6 py-10 text-white sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">Welcome to</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">HFC Restaurant</h1>
        <p className="mt-2 max-w-md text-brand-50">
          Fresh burgers, combos and meals — delivered fast or ready for pickup at your nearest outlet.
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
        <h2 className="mb-3 font-display text-lg font-bold text-ink-900">Choose an outlet</h2>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        )}

        {!isLoading && outlets?.length === 0 && (
          <Card>
            <CardContent className="text-center text-sm text-neutral-500">No outlets available right now.</CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {outlets?.map((outlet) => (
            <Card key={outlet._id} className={cn('flex flex-col', outletId === outlet._id && 'ring-2 ring-brand-500')}>
              <CardContent className="flex flex-1 flex-col gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-ink-900">{outlet.name}</h3>
                  <p className="mt-1 flex items-start gap-1 text-xs text-neutral-500">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {outlet.address}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                    <Clock className="h-3.5 w-3.5" /> 10:00 AM – 11:00 PM
                  </p>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
                  {MODES.map((mode) => (
                    <Button
                      key={mode.type}
                      variant="outline"
                      size="sm"
                      className="flex-col gap-1 py-3"
                      onClick={() => chooseOutletAndMode(outlet._id, mode.type)}
                    >
                      <mode.icon className="h-4 w-4" />
                      {mode.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
