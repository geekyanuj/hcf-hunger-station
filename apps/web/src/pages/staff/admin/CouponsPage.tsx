import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag } from 'lucide-react';
import { CouponApi } from '@/services/staffApi';
import { Card, CardContent, Badge, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils/cn';

interface CouponForm {
  [key: string]: unknown;
  code: string;
  description: string;
  discountType: 'FLAT' | 'PERCENT';
  value: number;
  minOrderValue: number;
  maxDiscount: number | undefined;
  newCustomerOnly: boolean;
  usageLimit: number | undefined;
  perCustomerUsageLimit: number | undefined;
}

const emptyForm: CouponForm = {
  code: '', description: '', discountType: 'PERCENT', value: 10, minOrderValue: 0,
  maxDiscount: undefined, newCustomerOnly: false, usageLimit: undefined, perCustomerUsageLimit: undefined,
};

export default function CouponsPage() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CouponForm>(emptyForm);

  const { data: coupons } = useQuery({ queryKey: ['coupons'], queryFn: CouponApi.list });

  const create = useMutation({
    mutationFn: () => CouponApi.create(form),
    onSuccess: () => {
      push('Coupon created', 'success');
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      setForm(emptyForm);
      setOpen(false);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => CouponApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coupons'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink-900">Coupons & Offers</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New coupon
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {coupons?.map((c: {
          _id: string; code: string; description?: string; discountType: string; value: number; minOrderValue: number;
          totalRedemptions: number; usageLimit?: number; isActive: boolean;
        }) => (
          <Card key={c._id}>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-display font-bold text-ink-900">
                  <Tag className="h-4 w-4 text-brand-500" /> {c.code}
                </div>
                <Badge variant={c.isActive ? 'success' : 'outline'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-sm text-neutral-500">{c.description}</p>
              <p className="text-sm font-semibold text-brand-600">
                {c.discountType === 'PERCENT' ? `${c.value}% off` : `${formatCurrency(c.value)} off`}
                {c.minOrderValue > 0 && ` · min ${formatCurrency(c.minOrderValue)}`}
              </p>
              <p className="text-xs text-neutral-400">
                Used {c.totalRedemptions}{c.usageLimit ? ` / ${c.usageLimit}` : ''} times
              </p>
              <Button size="sm" variant="outline" onClick={() => toggleActive.mutate({ id: c._id, isActive: !c.isActive })}>
                {c.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </CardContent>
          </Card>
        ))}
        {coupons?.length === 0 && <p className="text-neutral-400">No coupons yet.</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New coupon">
        <div className="space-y-3">
          <Input placeholder="Code (e.g. WELCOME50)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as 'FLAT' | 'PERCENT' })} className="h-11 rounded-xl border border-neutral-300 px-3 text-sm">
              <option value="PERCENT">Percentage</option>
              <option value="FLAT">Flat amount</option>
            </select>
            <Input type="number" placeholder="Value" value={form.value || ''} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" placeholder="Min order value" value={form.minOrderValue || ''} onChange={(e) => setForm({ ...form, minOrderValue: Number(e.target.value) })} />
            <Input type="number" placeholder="Max discount (optional)" value={form.maxDiscount ?? ''} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" placeholder="Total usage limit (optional)" value={form.usageLimit ?? ''} onChange={(e) => setForm({ ...form, usageLimit: e.target.value ? Number(e.target.value) : undefined })} />
            <Input type="number" placeholder="Per-customer limit (optional)" value={form.perCustomerUsageLimit ?? ''} onChange={(e) => setForm({ ...form, perCustomerUsageLimit: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={form.newCustomerOnly} onChange={(e) => setForm({ ...form, newCustomerOnly: e.target.checked })} className="accent-brand-500" />
            New customers only
          </label>
          <Button className="w-full" disabled={!form.code || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create coupon'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
