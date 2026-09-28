import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound } from 'lucide-react';
import { useQuery as useQ } from '@tanstack/react-query';
import { OutletApi } from '@/services/domainApi';
import { StaffAdminApi } from '@/services/staffApi';
import { Card, CardContent, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';

const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'INVENTORY', 'DELIVERY'];

export default function StaffManagementPage() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CASHIER', outletIds: [] as string[] });

  const { data: staff } = useQuery({ queryKey: ['staff-list'], queryFn: () => StaffAdminApi.list() });
  const { data: outlets } = useQ({ queryKey: ['outlets'], queryFn: OutletApi.list });

  const create = useMutation({
    mutationFn: () => StaffAdminApi.create(form),
    onSuccess: () => {
      push('Staff account created', 'success');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      setForm({ name: '', email: '', password: '', role: 'CASHIER', outletIds: [] });
      setOpen(false);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => StaffAdminApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-list'] }),
  });

  const resetPw = useMutation({
    mutationFn: () => StaffAdminApi.resetPassword(resetFor as string, newPassword),
    onSuccess: () => {
      push('Password reset', 'success');
      setResetFor(null);
      setNewPassword('');
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  function toggleOutlet(id: string) {
    setForm((f) => ({ ...f, outletIds: f.outletIds.includes(id) ? f.outletIds.filter((o) => o !== id) : [...f.outletIds, id] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink-900">Staff Management</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New staff member
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 text-left text-xs uppercase text-neutral-400">
              <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {staff?.map((s: { _id: string; name: string; email: string; role: string; isActive: boolean }) => (
                <tr key={s._id} className="border-b border-neutral-50">
                  <td className="p-3 font-medium text-ink-900">{s.name}</td>
                  <td className="p-3 text-neutral-500">{s.email}</td>
                  <td className="p-3"><Badge variant="outline">{s.role}</Badge></td>
                  <td className="p-3"><Badge variant={s.isActive ? 'success' : 'warning'}>{s.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="p-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setResetFor(s._id)}><KeyRound className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => toggleActive.mutate({ id: s._id, isActive: !s.isActive })}>
                      {s.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New staff member">
        <div className="space-y-3">
          <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input type="password" placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500">Assign to outlets</p>
            <div className="flex flex-wrap gap-2">
              {outlets?.map((o) => (
                <button
                  key={o._id}
                  onClick={() => toggleOutlet(o._id)}
                  className={`rounded-full border px-3 py-1 text-xs ${form.outletIds.includes(o._id) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600'}`}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" disabled={!form.name || !form.email || form.password.length < 8 || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create staff account'}
          </Button>
        </div>
      </Modal>

      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title="Reset password">
        <div className="space-y-3">
          <Input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Button className="w-full" disabled={newPassword.length < 8 || resetPw.isPending} onClick={() => resetPw.mutate()}>
            {resetPw.isPending ? 'Saving…' : 'Reset password'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
