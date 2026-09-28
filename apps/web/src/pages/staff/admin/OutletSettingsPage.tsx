import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { OutletApi } from '@/services/domainApi';
import { OutletAdminApi } from '@/services/staffApi';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { Card, CardContent, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';

export default function OutletSettingsPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const { push } = useToast();

  const { data: outlet } = useQuery({
    queryKey: ['outlet-detail', activeOutletId],
    queryFn: () => OutletApi.getById(activeOutletId as string),
    enabled: !!activeOutletId,
  });

  const [form, setForm] = useState({
    name: '', address: '', phone: '', email: '',
    taxPercentage: 5, packagingCharge: 10, deliveryBaseCharge: 30,
    kitchenCapacityPerSlot: 6, busyActiveOrders: 8, criticalActiveOrders: 14,
  });

  useEffect(() => {
    if (outlet) {
      setForm({
        name: outlet.name, address: outlet.address, phone: outlet.phone, email: outlet.email,
        taxPercentage: outlet.settings.taxPercentage, packagingCharge: outlet.settings.packagingCharge,
        deliveryBaseCharge: outlet.settings.deliveryBaseCharge,
        kitchenCapacityPerSlot: (outlet.settings as unknown as { kitchenCapacityPerSlot: number }).kitchenCapacityPerSlot ?? 6,
        busyActiveOrders: 8, criticalActiveOrders: 14,
      });
    }
  }, [outlet]);

  const save = useMutation({
    mutationFn: () =>
      OutletAdminApi.update(activeOutletId as string, {
        name: form.name, address: form.address, phone: form.phone, email: form.email,
        settings: {
          taxPercentage: form.taxPercentage, packagingCharge: form.packagingCharge, deliveryBaseCharge: form.deliveryBaseCharge,
          kitchenCapacityPerSlot: form.kitchenCapacityPerSlot,
          kitchenLoadThresholds: { busyActiveOrders: form.busyActiveOrders, criticalActiveOrders: form.criticalActiveOrders, delayedOrderMinutes: 20 },
        },
      }),
    onSuccess: () => {
      push('Outlet settings saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['outlet-detail'] });
      queryClient.invalidateQueries({ queryKey: ['outlets'] });
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  if (!activeOutletId) return <p className="text-neutral-500">Select an outlet.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Store className="h-6 w-6 text-brand-500" />
        <h1 className="font-display text-2xl font-bold text-ink-900">Outlet Settings</h1>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold text-ink-900">Basic Information</h2>
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold text-ink-900">Tax & Charges (configurable, never hard-coded)</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Tax %</label>
              <Input type="number" value={form.taxPercentage} onChange={(e) => setForm({ ...form, taxPercentage: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Packaging ₹</label>
              <Input type="number" value={form.packagingCharge} onChange={(e) => setForm({ ...form, packagingCharge: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Delivery ₹</label>
              <Input type="number" value={form.deliveryBaseCharge} onChange={(e) => setForm({ ...form, deliveryBaseCharge: Number(e.target.value) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold text-ink-900">Kitchen Capacity & Load Thresholds</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Capacity/slot</label>
              <Input type="number" value={form.kitchenCapacityPerSlot} onChange={(e) => setForm({ ...form, kitchenCapacityPerSlot: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">"Busy" at</label>
              <Input type="number" value={form.busyActiveOrders} onChange={(e) => setForm({ ...form, busyActiveOrders: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">"Critical" at</label>
              <Input type="number" value={form.criticalActiveOrders} onChange={(e) => setForm({ ...form, criticalActiveOrders: Number(e.target.value) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  );
}
