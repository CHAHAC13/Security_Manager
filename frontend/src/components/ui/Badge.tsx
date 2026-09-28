import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'blue'
  | 'slate';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  /** Use pill shape (rounded-full) instead of default rounded */
  pill?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function Badge({
  children,
  variant = 'default',
  pill = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-[11px] font-medium border',
        pill ? 'rounded-full' : 'rounded',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
