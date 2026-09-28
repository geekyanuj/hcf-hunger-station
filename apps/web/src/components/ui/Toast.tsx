import * as React from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  push: (message: string, type?: Toast['type']) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const push = React.useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-2 rounded-xl border bg-white px-4 py-3 shadow-floating animate-in fade-in slide-in-from-bottom-2',
              t.type === 'success' && 'border-emerald-200',
              t.type === 'error' && 'border-red-200',
              t.type === 'info' && 'border-neutral-200'
            )}
          >
            {t.type === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
            {t.type === 'error' && <XCircle className="h-5 w-5 shrink-0 text-red-600" />}
            {t.type === 'info' && <Info className="h-5 w-5 shrink-0 text-brand-600" />}
            <p className="flex-1 text-sm text-ink-900">{t.message}</p>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <X className="h-4 w-4 text-neutral-400" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
