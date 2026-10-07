import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MonitorSmartphone, Printer, AlertTriangle } from 'lucide-react';
import { PrintApi, PrintJob } from '@/services/staffApi';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { useSessionStore } from '@/stores/session.store';
import { extractErrorMessage } from '@/services/apiClient';
import { printPlainText } from '@/utils/printToken';
import { Card, CardContent, Badge, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const DRIVER_LABEL: Record<string, string> = {
  DISABLED: 'Browser print only',
  NETWORK: 'Network printer (Ethernet / Wi-Fi)',
  FILE: 'USB / shared printer path',
  CONSOLE: 'Development (API log)',
};

const STATUS_BADGE: Record<PrintJob['status'], { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  PRINTED: { label: 'Printed', variant: 'success' },
  BROWSER: { label: 'Browser', variant: 'outline' },
  FAILED: { label: 'Failed', variant: 'warning' },
};

/** Thermal printer status, a test slip, and the recent print log. Configuration itself lives in the API environment (docs/PRINTING.md). */
export default function PrinterPage() {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const { activeOutletId } = useStaffOutletStore();
  const canSeeLog = useSessionStore((s) => s.hasPermission('audit.read'));

  const { data: status, isLoading } = useQuery({ queryKey: ['print-status'], queryFn: PrintApi.status });
  const { data: jobs } = useQuery({
    queryKey: ['print-jobs', activeOutletId],
    queryFn: () => PrintApi.jobs(activeOutletId as string, 15),
    enabled: !!activeOutletId && canSeeLog,
  });

  const test = useMutation({
    mutationFn: () => PrintApi.test(activeOutletId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] });
    },
    onError: (err) => {
      push(extractErrorMessage(err), 'error');
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] });
    },
  });

  function previewTestSlip() {
    try {
      printPlainText('Browser print test', `BROWSER PRINT TEST\n58 mm roll\n${new Date().toLocaleString('en-IN')}`);
      push('Test slip opened in browser print preview', 'success');
    } catch (error) {
      push(extractErrorMessage(error), 'error');
    }
    test.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Browser Printing</h1>
        <p className="text-sm text-neutral-500">Kitchen tokens and customer bills open in the browser print preview for 58 mm thermal paper.</p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          {isLoading && <Skeleton className="h-28" />}
          {status && (
            <>
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                  <MonitorSmartphone className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">Browser print preview only</p>
                  <p className="text-sm text-neutral-500">{DRIVER_LABEL[status.driver] ?? status.driver}</p>
                  {status.hint && (
                    <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {status.hint}
                    </p>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Info label="Target" value={status.target} />
                <Info label="Paper" value={`${status.paperWidthMm} mm (${status.charactersPerLine} chars)`} />
                <Info label="Auto-cut" value={status.autoCut ? 'On' : 'Off'} />
                <Info label="Copies" value={String(status.defaultCopies)} />
              </dl>

              <Button onClick={previewTestSlip} disabled={!activeOutletId || test.isPending}>
                <Printer className="mr-1.5 h-4 w-4" />
                {test.isPending ? 'Preparing…' : 'Preview test slip'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {canSeeLog && (
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-display font-bold text-ink-900">Recent prints</h2>
            {jobs && jobs.length === 0 && <p className="text-sm text-neutral-500">Nothing printed yet.</p>}
            <div className="divide-y divide-neutral-100">
              {jobs?.map((j) => (
                <div key={j._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {j.type === 'TEST' ? 'Test slip' : `Token ${j.tokenNumber ?? ''}`}
                      {j.isReprint && <span className="ml-1.5 text-xs font-normal text-neutral-500">reprint</span>}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {new Date(j.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      {j.requestedBy ? ` · ${j.requestedBy.name}` : ''}
                      {j.error ? ` · ${j.error}` : ''}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[j.status].variant}>
                    {j.status === 'PRINTED' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                    {STATUS_BADGE[j.status].label}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
