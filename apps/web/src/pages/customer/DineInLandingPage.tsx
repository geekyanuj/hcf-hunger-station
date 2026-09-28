import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MenuApi } from '@/services/domainApi';
import { useCartStore } from '@/stores/cart.store';
import { Loader2, UtensilsCrossed } from 'lucide-react';

export default function DineInLandingPage() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const navigate = useNavigate();
  const setOutlet = useCartStore((s) => s.setOutlet);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const setTableQrToken = useCartStore((s) => s.setTableQrToken);

  const { data: table, isLoading, isError } = useQuery({
    queryKey: ['table', qrToken],
    queryFn: () => MenuApi.resolveTable(qrToken as string),
    enabled: !!qrToken,
    retry: false,
  });

  useEffect(() => {
    if (table) {
      setOutlet(table.outletId._id ?? table.outletId);
      setOrderType('DINE_IN');
      setTableQrToken(qrToken ?? null);
      navigate('/menu', { replace: true });
    }
  }, [table, qrToken, navigate, setOutlet, setOrderType, setTableQrToken]);

  if (isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <UtensilsCrossed className="h-10 w-10 text-neutral-300" />
        <h1 className="font-display text-xl font-bold">Table not found</h1>
        <p className="text-sm text-neutral-500">This QR code isn't linked to an active table. Please ask staff for help.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      <p className="text-sm text-neutral-500">{isLoading ? 'Loading your table...' : 'Redirecting to menu...'}</p>
    </div>
  );
}
