import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { PartyPopper } from 'lucide-react';
import { OutletApi } from '@/services/domainApi';
import { PartyOrderApi } from '@/services/staffApi';
import { Card, CardContent, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';

const EVENT_TYPES = ['BIRTHDAY', 'WEDDING', 'OFFICE', 'PARTY', 'OTHER'];

export default function PartyRequestPage() {
  const { push } = useToast();
  const { data: outlets } = useQuery({ queryKey: ['outlets'], queryFn: OutletApi.list });
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    outletId: '', contactName: '', contactPhone: '', contactEmail: '', eventType: 'BIRTHDAY', expectedGuests: 20,
    eventDate: '', eventTime: '19:00', foodPreference: 'MIXED', requirements: '', approximateBudget: undefined as number | undefined,
    deliverySetupRequired: false,
  });

  const submit = useMutation({
    mutationFn: () => PartyOrderApi.submit({ ...form, eventDate: new Date(form.eventDate).toISOString() }),
    onSuccess: () => {
      push('Request submitted! Our team will contact you shortly.', 'success');
      setSubmitted(true);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <PartyPopper className="mx-auto h-12 w-12 text-brand-500" />
        <h1 className="mt-3 font-display text-2xl font-bold text-ink-900">Thanks for reaching out!</h1>
        <p className="mt-2 text-neutral-500">Our team will review your event details and get in touch with a quotation.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="text-center">
        <PartyPopper className="mx-auto h-10 w-10 text-brand-500" />
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Party & Catering Requests</h1>
        <p className="text-sm text-neutral-500">Tell us about your event and we'll prepare a custom quotation.</p>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <select value={form.outletId} onChange={(e) => setForm({ ...form, outletId: e.target.value })} className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm">
            <option value="">Select outlet</option>
            {outlets?.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Your name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            <Input placeholder="Phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </div>
          <Input placeholder="Email (optional)" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />

          <div className="grid grid-cols-2 gap-3">
            <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} className="h-11 rounded-xl border border-neutral-300 px-3 text-sm">
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Input type="number" placeholder="Expected guests" value={form.expectedGuests || ''} onChange={(e) => setForm({ ...form, expectedGuests: Number(e.target.value) })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
            <Input type="time" value={form.eventTime} onChange={(e) => setForm({ ...form, eventTime: e.target.value })} />
          </div>

          <select value={form.foodPreference} onChange={(e) => setForm({ ...form, foodPreference: e.target.value })} className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm">
            <option value="VEG">Vegetarian</option>
            <option value="NON_VEG">Non-vegetarian</option>
            <option value="MIXED">Mixed</option>
          </select>

          <Input type="number" placeholder="Approximate budget (optional)" value={form.approximateBudget ?? ''} onChange={(e) => setForm({ ...form, approximateBudget: e.target.value ? Number(e.target.value) : undefined })} />

          <textarea
            placeholder="Food requirements, dietary notes, etc."
            value={form.requirements}
            onChange={(e) => setForm({ ...form, requirements: e.target.value })}
            className="h-20 w-full resize-none rounded-xl border border-neutral-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />

          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={form.deliverySetupRequired} onChange={(e) => setForm({ ...form, deliverySetupRequired: e.target.checked })} className="accent-brand-500" />
            I need delivery & setup at the venue
          </label>

          <Button
            className="w-full"
            disabled={!form.outletId || !form.contactName || !form.contactPhone || !form.eventDate || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
