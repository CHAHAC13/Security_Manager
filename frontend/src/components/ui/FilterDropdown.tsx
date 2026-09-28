import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FilterDropdownProps<T extends string> {
  label: string;
  options: T[];
  value: T | null;
  onChange: (value: T | null) => void;
}

export function FilterDropdown<T extends string>({
  label,
  options,
  value,
  onChange,
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
          'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500',
          value
            ? 'text-sky-700 bg-sky-50 border-sky-200'
            : 'text-slate-700 bg-white border-slate-300',
        )}
      >
        <span>{value ?? label}</span>
        <ChevronDown className="w-3.5 h-3.5 ml-2 text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-md shadow-lg z-30 py-1">
          {/* Clear option */}
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="block w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
          >
            All {label}s
          </button>

          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                'block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50',
                opt === value
                  ? 'text-sky-700 font-medium bg-sky-50'
                  : 'text-slate-700',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
