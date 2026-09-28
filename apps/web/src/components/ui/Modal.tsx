import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-floating sm:max-w-md sm:rounded-2xl'
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="font-display text-lg font-bold text-ink-900">{title}</h3>}
          <button onClick={onClose} className="ml-auto rounded-full p-1 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
