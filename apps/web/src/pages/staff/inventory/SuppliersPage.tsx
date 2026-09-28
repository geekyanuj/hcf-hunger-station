import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Phone, Mail } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { SupplierApi } from '@/services/staffApi';
import { Card, CardContent, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';

export default function SuppliersPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', gstin: '', paymentTerms: '' });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', activeOutletId],
    queryFn: () => SupplierApi.list(activeOutletId as string),
    enabled: !!activeOutletId,
  });

  const create = useMutation({
    mutationFn: () => SupplierApi.create({ ...form, outletId: activeOutletId }),
    onSuccess: () => {
      push('Supplier added', 'success');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setOpen(false);
      setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', gstin: '', paymentTerms: '' });
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New supplier
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {suppliers?.map((s: { _id: string; name: string; contactPerson?: string; phone: string; email?: string; paymentTerms?: string }) => (
          <Card key={s._id}>
            <CardContent className="space-y-1.5">
              <h3 className="font-display font-bold text-ink-900">{s.name}</h3>
              {s.contactPerson && <p className="text-sm text-neutral-500">{s.contactPerson}</p>}
              <p className="flex items-center gap-1.5 text-sm text-neutral-600"><Phone className="h-3.5 w-3.5" /> {s.phone}</p>
              {s.email && <p className="flex items-center gap-1.5 text-sm text-neutral-600"><Mail className="h-3.5 w-3.5" /> {s.email}</p>}
              {s.paymentTerms && <p className="text-xs text-neutral-400">Terms: {s.paymentTerms}</p>}
            </CardContent>
          </Card>
        ))}
        {suppliers?.length === 0 && <p className="text-neutral-400">No suppliers yet.</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New supplier">
        <div className="space-y-3">
          <Input placeholder="Supplier name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Contact person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="GSTIN (optional)" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            <Input placeholder="Payment terms" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
          </div>
          <Button className="w-full" disabled={!form.name || !form.phone || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Saving…' : 'Add supplier'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
