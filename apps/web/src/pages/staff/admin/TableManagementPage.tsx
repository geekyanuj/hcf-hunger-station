import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, QrCode } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { TableAdminApi } from '@/services/staffApi';
import { Card, CardContent, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  AVAILABLE: 'success', OCCUPIED: 'warning', RESERVED: 'outline', INACTIVE: 'outline',
};

export default function TableManagementPage() {
  const { activeOutletId } = useStaffOutletStore();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [qrTable, setQrTable] = useState<{ tableNumber: string; qrToken: string } | null>(null);
  const [form, setForm] = useState({ tableNumber: '', capacity: 4 });

  const { data: tables } = useQuery({
    queryKey: ['tables', activeOutletId],
    queryFn: () => TableAdminApi.list(activeOutletId as string),
    enabled: !!activeOutletId,
  });

  const create = useMutation({
    mutationFn: () => TableAdminApi.create({ ...form, outletId: activeOutletId }),
    onSuccess: () => {
      push('Table created', 'success');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setForm({ tableNumber: '', capacity: 4 });
      setOpen(false);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => TableAdminApi.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tables'] }),
  });

  const regenerate = useMutation({
    mutationFn: (id: string) => TableAdminApi.regenerateQr(id),
    onSuccess: () => { push('QR code regenerated', 'success'); queryClient.invalidateQueries({ queryKey: ['tables'] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink-900">Table Management</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New table
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tables?.map((t: { _id: string; tableNumber: string; capacity: number; status: string; qrToken: string }) => (
          <Card key={t._id}>
            <CardContent className="space-y-2 text-center">
              <p className="font-display text-2xl font-bold text-ink-900">#{t.tableNumber}</p>
              <p className="text-xs text-neutral-500">Seats {t.capacity}</p>
              <select
                value={t.status}
                onChange={(e) => updateStatus.mutate({ id: t._id, status: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs"
              >
                {Object.keys(STATUS_VARIANT).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setQrTable(t)}>
                  <QrCode className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => regenerate.mutate(t._id)}>
                  Regen QR
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New table">
        <div className="space-y-3">
          <Input placeholder="Table number" value={form.tableNumber} onChange={(e) => setForm({ ...form, tableNumber: e.target.value })} />
          <Input type="number" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          <Button className="w-full" disabled={!form.tableNumber || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create table'}
          </Button>
        </div>
      </Modal>

      <Modal open={!!qrTable} onClose={() => setQrTable(null)} title={`QR for Table ${qrTable?.tableNumber}`}>
        <div className="space-y-3 text-center">
          <p className="break-all rounded-lg bg-neutral-50 p-3 font-mono text-xs">{window.location.origin}/t/{qrTable?.qrToken}</p>
          <p className="text-sm text-neutral-500">Print this URL as a QR code and place it on the table. Scanning it identifies the outlet and table automatically.</p>
        </div>
      </Modal>
    </div>
  );
}
