import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import { DashboardApi } from '@/services/staffApi';
import { extractErrorMessage } from '@/services/apiClient';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/**
 * Password-confirmed "Reset dashboard". The dashboard starts counting again from this moment; nothing is deleted
 * (orders, payments, analytics and exports keep the full history). The password is verified by the server.
 */
export function ResetDashboardDialog({
  open,
  onClose,
  outletParam,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  /** Same value the dashboard is currently showing: an outlet id, or 'ALL'. */
  outletParam: string;
  scopeLabel: string;
}) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Never keep a typed password around after the dialog closes.
  useEffect(() => {
    if (!open) {
      setPassword('');
      setError(null);
    }
  }, [open]);

  const reset = useMutation({
    mutationFn: () => DashboardApi.reset(outletParam, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      push('Dashboard reset - counting from now', 'success');
      onClose();
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!password || reset.isPending) return;
    setError(null);
    reset.mutate();
  }

  return (
    <Modal open={open} onClose={onClose} title="Reset dashboard">
      <form onSubmit={submit} className="space-y-4 text-ink-900">
        <div className="flex gap-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This sets the dashboard for <b>{scopeLabel}</b> back to zero and it will count only new orders from now on.{' '}
            <b>No orders, payments, reports or exports are deleted</b> - Analytics still shows your full history.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-neutral-600">Enter your password to confirm</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="Your login password"
            className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!password || reset.isPending}>
            <RotateCcw className="h-4 w-4" />
            {reset.isPending ? 'Resetting…' : 'Reset dashboard'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
