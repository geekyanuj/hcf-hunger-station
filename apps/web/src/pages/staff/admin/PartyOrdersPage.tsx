import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PartyPopper, Phone } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { PartyOrderApi } from '@/services/staffApi';
import { Card, CardContent, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils/cn';

const STATUS_VARIANT: Record<string, 'outline' | 'success' | 'warning'> = {
  REQUESTED: 'warning', CONTACTED: 'outline', QUOTED: 'outline', APPROVED: 'success', REJECTED: 'warning', CONVERTED: 'success',
};

export default function PartyOrdersPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState({ description: '', amount: 0 });

  const { data: requests } = useQuery({
    queryKey: ['party-orders', activeOutletId],
    queryFn: () => PartyOrderApi.list(activeOutletId as string),
    enabled: !!activeOutletId,
  });

  const contacted = useMutation({
    mutationFn: (id: string) => PartyOrderApi.markContacted(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['party-orders'] }),
  });
  const approve = useMutation({
    mutationFn: (id: string) => PartyOrderApi.approve(id),
    onSuccess: () => { push('Quotation approved', 'success'); queryClient.invalidateQueries({ queryKey: ['party-orders'] }); },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });
  const reject = useMutation({
    mutationFn: (id: string) => PartyOrderApi.reject(id, 'Not feasible'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['party-orders'] }),
  });
  const addQuotation = useMutation({
    mutationFn: () => PartyOrderApi.addQuotation(quoteFor as string, quoteForm),
    onSuccess: () => {
      push('Quotation sent', 'success');
      queryClient.invalidateQueries({ queryKey: ['party-orders'] });
      setQuoteFor(null);
      setQuoteForm({ description: '', amount: 0 });
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PartyPopper className="h-6 w-6 text-brand-500" />
        <h1 className="font-display text-2xl font-bold text-ink-900">Party & Catering Requests</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {requests?.map((r: {
          _id: string; contactName: string; contactPhone: string; eventType: string; expectedGuests: number;
          eventDate: string; eventTime: string; foodPreference: string; status: string; approximateBudget?: number;
          requirements?: string; quotations: { description: string; amount: number }[];
        }) => (
          <Card key={r._id}>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-ink-900">{r.eventType} — {r.expectedGuests} guests</h3>
                <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
              </div>
              <p className="flex items-center gap-1.5 text-sm text-neutral-600"><Phone className="h-3.5 w-3.5" /> {r.contactName} · {r.contactPhone}</p>
              <p className="text-sm text-neutral-500">{new Date(r.eventDate).toLocaleDateString()} at {r.eventTime} · {r.foodPreference}</p>
              {r.approximateBudget && <p className="text-sm text-neutral-500">Budget: ~{formatCurrency(r.approximateBudget)}</p>}
              {r.requirements && <p className="text-xs italic text-neutral-400">"{r.requirements}"</p>}
              {r.quotations.length > 0 && (
                <p className="text-sm font-semibold text-brand-600">
                  Latest quote: {formatCurrency(r.quotations[r.quotations.length - 1].amount)} — {r.quotations[r.quotations.length - 1].description}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {r.status === 'REQUESTED' && (
                  <Button size="sm" variant="outline" onClick={() => contacted.mutate(r._id)}>Mark contacted</Button>
                )}
                {['CONTACTED', 'REQUESTED'].includes(r.status) && (
                  <Button size="sm" onClick={() => setQuoteFor(r._id)}>Send quotation</Button>
                )}
                {r.status === 'QUOTED' && (
                  <>
                    <Button size="sm" onClick={() => approve.mutate(r._id)}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => reject.mutate(r._id)}>Reject</Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {requests?.length === 0 && <p className="text-neutral-400">No party/catering requests yet.</p>}
      </div>

      <Modal open={!!quoteFor} onClose={() => setQuoteFor(null)} title="Send quotation">
        <div className="space-y-3">
          <textarea
            placeholder="Description (e.g. 50 veg + 50 non-veg thalis, dessert, setup included)"
            value={quoteForm.description}
            onChange={(e) => setQuoteForm({ ...quoteForm, description: e.target.value })}
            className="h-24 w-full resize-none rounded-xl border border-neutral-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <Input type="number" placeholder="Total amount (₹)" value={quoteForm.amount || ''} onChange={(e) => setQuoteForm({ ...quoteForm, amount: Number(e.target.value) })} />
          <Button className="w-full" disabled={!quoteForm.description || quoteForm.amount <= 0 || addQuotation.isPending} onClick={() => addQuotation.mutate()}>
            {addQuotation.isPending ? 'Sending…' : 'Send quotation'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
