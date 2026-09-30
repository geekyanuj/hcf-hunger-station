import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Leaf, Flame, ShoppingBag } from 'lucide-react';
import { MenuApi } from '@/services/domainApi';
import { useCartStore } from '@/stores/cart.store';
import { Card, CardContent, Skeleton, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useSingleOutlet } from '@/hooks/useSingleOutlet';
import { AddToCartModal } from '@/components/customer/AddToCartModal';
import { formatCurrency, cn } from '@/utils/cn';
import { resolveImageUrl } from '@/services/apiClient';
import { MenuItem } from '@/types/domain';

type VegFilter = 'ALL' | 'VEG' | 'NONVEG';

export default function MenuPage() {
  const navigate = useNavigate();
  const outletId = useCartStore((s) => s.outletId);
  const { isLoading: outletLoading } = useSingleOutlet();
  const orderType = useCartStore((s) => s.orderType);
  const itemCount = useCartStore((s) => s.itemCount());
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [vegFilter, setVegFilter] = useState<VegFilter>('ALL');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const { data: sections, isLoading } = useQuery({
    queryKey: ['menu', outletId],
    queryFn: () => MenuApi.getFullMenu(outletId as string),
    enabled: !!outletId,
  });

  const filteredSections = useMemo(() => {
    if (!sections) return [];
    return sections
      .filter((s) => !activeCategory || s.category._id === activeCategory)
      .map((s) => ({
        ...s,
        items: s.items
          .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
          .filter((i) => (vegFilter === 'VEG' ? i.isVeg : vegFilter === 'NONVEG' ? !i.isVeg : true)),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, activeCategory, search, vegFilter]);

  if (!outletId) {
    return outletLoading ? (
      <div className="space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
      </div>
    ) : (
      <div className="py-16 text-center">
        <p className="text-neutral-500">We're not taking orders right now.</p>
        <Button className="mt-4" onClick={() => navigate('/')}>
          Back to home
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Menu</h1>
          <p className="text-sm text-neutral-500">Ordering: {orderType.replace('_', '-').toLowerCase()}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input placeholder="Search menu" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Veg / Non-veg filter */}
      <div className="flex gap-2">
        {(['ALL', 'VEG', 'NONVEG'] as VegFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setVegFilter(f)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium',
              vegFilter === f ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 text-neutral-600'
            )}
          >
            {f === 'VEG' && <Leaf className="h-3.5 w-3.5" />}
            {f === 'NONVEG' && <Flame className="h-3.5 w-3.5" />}
            {f === 'ALL' ? 'All' : f === 'VEG' ? 'Veg' : 'Non-veg'}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {!isLoading && sections && sections.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium',
              !activeCategory ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 text-neutral-600'
            )}
          >
            All
          </button>
          {sections.map((s) => (
            <button
              key={s.category._id}
              onClick={() => setActiveCategory(s.category._id)}
              className={cn(
                'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium',
                activeCategory === s.category._id ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 text-neutral-600'
              )}
            >
              {s.category.name}
            </button>
          ))}
        </div>
      )}

      {!isLoading && filteredSections.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">No items match your search.</CardContent>
        </Card>
      )}

      {filteredSections.map((section) => (
        <section key={section.category._id}>
          <h2 className="mb-3 font-display text-lg font-bold text-ink-900">{section.category.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const finalPrice =
                item.offerPercent > 0 ? item.price * (1 - item.offerPercent / 100) : item.discountPrice ?? item.price;
              return (
                <Card key={item._id} className="flex flex-col overflow-hidden">
                  <div className="relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 to-neutral-100">
                    {item.images?.[0] ? (
                      <img src={resolveImageUrl(item.images[0])} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-4xl">🍽️</span>
                    )}
                    {item.offerPercent > 0 && (
                      <Badge variant="warning" className="absolute left-2 top-2">
                        {item.offerPercent}% OFF
                      </Badge>
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-ink-900">{item.name}</h3>
                      {item.isVeg ? (
                        <Leaf className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Flame className="h-4 w-4 shrink-0 text-red-500" />
                      )}
                    </div>
                    {item.isPopular && <Badge variant="warning">Popular</Badge>}
                    <p className="line-clamp-2 text-xs text-neutral-500">{item.description}</p>
                    {item.ingredients?.length > 0 && (
                      <p className="line-clamp-1 text-xs text-neutral-400">{item.ingredients.join(', ')}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div>
                        {item.offerPercent > 0 && (
                          <span className="mr-1.5 text-xs text-neutral-400 line-through">{formatCurrency(item.price)}</span>
                        )}
                        <span className="font-display font-bold text-ink-900">{formatCurrency(finalPrice)}</span>
                      </div>
                      <Button size="sm" onClick={() => setSelectedItem(item)}>
                        Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <AddToCartModal item={selectedItem} onClose={() => setSelectedItem(null)} />

      {itemCount > 0 && (
        <button
          onClick={() => navigate('/cart')}
          className="fixed inset-x-4 bottom-20 z-30 flex items-center justify-between rounded-2xl bg-ink-900 px-5 py-4 text-white shadow-floating sm:inset-x-auto sm:right-6 sm:w-80 sm:bottom-6"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag className="h-4 w-4" /> View cart ({itemCount})
          </span>
          <span className="text-sm font-bold">→</span>
        </button>
      )}
    </div>
  );
}

