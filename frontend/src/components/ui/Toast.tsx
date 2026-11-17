import { useEffect } from 'react';
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastProps {
  message: string;
  variant?: 'success' | 'error' | 'loading';
  onDismiss: () => void;
  /** Auto-dismiss delay in ms; 0 disables auto-dismiss. */
  duration?: number;
  className?: string;
}

export function Toast({ message, variant = 'success', onDismiss, duration = 4000, className }: ToastProps) {
  useEffect(() => {
    if (!duration || variant === 'loading') return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss, variant]);
  const Icon = variant === 'success' ? CheckCircle2 : variant === 'loading' ? Loader2 : XCircle;
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg',
        variant === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : variant === 'loading' ? 'border-sky-200 bg-sky-50 text-sky-800'
            : 'border-rose-200 bg-rose-50 text-rose-800',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', variant === 'loading' && 'animate-spin')} aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {variant !== 'loading' && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="rounded p-0.5 hover:bg-black/5">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
