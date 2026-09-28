import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { LoyaltyApi } from '@/services/staffApi';
import { Card, CardContent, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';

export default function LoyaltyPage() {
  const { push } = useToast();
  const { data: config } = useQuery({ queryKey: ['loyalty-config'], queryFn: () => LoyaltyApi.getConfig() });

  const [form, setForm] = useState({
    isActive: true, pointsPerRupeeSpent: 0.01, redemptionValuePerPoint: 0.1, minPointsToRedeem: 50, maxRedemptionPercentOfOrder: 50,
  });

  useEffect(() => {
    if (config) {
      setForm({
        isActive: config.isActive,
        pointsPerRupeeSpent: config.pointsPerRupeeSpent,
        redemptionValuePerPoint: config.redemptionValuePerPoint,
        minPointsToRedeem: config.minPointsToRedeem,
        maxRedemptionPercentOfOrder: config.maxRedemptionPercentOfOrder,
      });
    }
  }, [config]);

  const save = useMutation({
    mutationFn: () => LoyaltyApi.upsertConfig(form),
    onSuccess: () => push('Loyalty configuration saved', 'success'),
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const rupeesPerPoint = form.pointsPerRupeeSpent > 0 ? Math.round(1 / form.pointsPerRupeeSpent) : 0;
  const pointsForTenRupees = form.redemptionValuePerPoint > 0 ? Math.round(0.1 / form.redemptionValuePerPoint * 100) : 0;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Gift className="h-6 w-6 text-brand-500" />
        <h1 className="font-display text-2xl font-bold text-ink-900">Customer Loyalty</h1>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
            Currently: ₹{rupeesPerPoint} spent = 1 point, and 100 points = ₹{Math.round(form.redemptionValuePerPoint * 100)}.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="accent-brand-500" />
            Loyalty program active
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Points earned per ₹1 spent</label>
            <Input type="number" step="0.001" value={form.pointsPerRupeeSpent} onChange={(e) => setForm({ ...form, pointsPerRupeeSpent: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">₹ value per point when redeemed</label>
            <Input type="number" step="0.01" value={form.redemptionValuePerPoint} onChange={(e) => setForm({ ...form, redemptionValuePerPoint: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Minimum points required to redeem</label>
            <Input type="number" value={form.minPointsToRedeem} onChange={(e) => setForm({ ...form, minPointsToRedeem: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Max % of an order payable via points</label>
            <Input type="number" value={form.maxRedemptionPercentOfOrder} onChange={(e) => setForm({ ...form, maxRedemptionPercentOfOrder: Number(e.target.value) })} />
          </div>

          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save loyalty settings'}
          </Button>
          <p className="text-center text-xs text-neutral-400">
            Future-ready: tiers, birthday offers, and referral bonuses can be layered on top of this same ledger — see docs/PART3.md.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
