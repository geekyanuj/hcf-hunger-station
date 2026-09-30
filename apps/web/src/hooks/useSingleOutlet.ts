import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OutletApi } from '@/services/domainApi';
import { useCartStore } from '@/stores/cart.store';

/**
 * HCF runs from a single outlet (HCF Azadnagar), so customers never pick one. This loads it and keeps the cart
 * pointed at it - which also self-heals a cart that still holds an id from the old multi-outlet setup.
 */
export function useSingleOutlet() {
  const setOutlet = useCartStore((s) => s.setOutlet);
  const query = useQuery({ queryKey: ['outlets'], queryFn: OutletApi.list });
  const outlet = query.data?.find((o) => o.isActive) ?? query.data?.[0];

  useEffect(() => {
    if (outlet) setOutlet(outlet._id);
  }, [outlet, setOutlet]);

  return { outlet, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}
