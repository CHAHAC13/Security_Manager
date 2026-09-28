import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
  children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 hover:bg-brand-600 text-white shadow-sm focus:ring-2 focus:ring-brand-500',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  accent:
    'bg-accent-500 hover:bg-accent-600 text-white shadow-sm focus:ring-2 focus:ring-accent-500',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
};

export function Button({
  variant = 'secondary',
  icon,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none',
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      {icon && <span className="mr-1.5">{icon}</span>}
      {children}
    </button>
  );
}
