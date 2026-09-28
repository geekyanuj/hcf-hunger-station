import * as React from 'react';
import { cn } from '@/utils/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl2 border border-neutral-200 bg-white shadow-card', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'success' | 'warning' | 'outline' }) {
  const styles = {
    default: 'bg-brand-100 text-brand-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    outline: 'border border-neutral-300 text-neutral-600',
  } as const;
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', styles[variant], className)}
      {...props}
    />
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}
