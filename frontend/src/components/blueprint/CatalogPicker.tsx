import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { CatalogOption } from '@/types/blueprint';
import { cn } from '@/lib/utils';

interface CatalogPickerProps {
  value: string;
  items: CatalogOption[];
  search: string;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onSearchChange: (search: string) => void;
  onChange: (catalogId: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

export function CatalogPicker({
  value,
  items,
  search,
  loading,
  loadingMore,
  error,
  hasMore,
  onSearchChange,
  onChange,
  onLoadMore,
  onRetry,
}: CatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const setLoadMoreRef = useCallback((button: HTMLButtonElement | null) => {
    if (!button && loadMoreRef.current === document.activeElement) {
      searchRef.current?.focus();
    }
    loadMoreRef.current = button;
  }, []);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function selectCatalog(catalogId: string) {
    if (catalogId !== value) onChange(catalogId);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        id="catalog-select"
        type="button"
        aria-label={`Catalog selection: ${value || 'Select a catalog'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'catalog-picker' : undefined}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 h-9 px-3 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
      >
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Target:</span>
        <span className="flex-1 truncate text-left font-mono">{value || 'Select a catalog…'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div
          id="catalog-picker"
          role="dialog"
          aria-label="Choose a catalog"
          className="absolute top-full left-0 z-20 mt-1 w-full min-w-64 rounded-md border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              autoFocus
              type="search"
              aria-label="Search catalogs"
              placeholder="Search catalog names…"
              maxLength={200}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1" aria-busy={loading || loadingMore}>
            <button
              type="button"
              onClick={() => selectCatalog('')}
              className="w-full rounded px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 focus-visible:outline-sky-500"
            >
              Select a catalog…
            </button>
            {!loading && items.map((catalog) => (
              <button
                key={catalog.id}
                type="button"
                aria-pressed={value === catalog.id}
                onClick={() => selectCatalog(catalog.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-mono hover:bg-sky-50 focus-visible:outline-sky-500',
                  value === catalog.id ? 'bg-sky-50 text-sky-800' : 'text-slate-700',
                )}
              >
                <span className="flex-1 break-all">{catalog.name}</span>
                {value === catalog.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
            {loading && (
              <p role="status" className="px-3 py-2 text-xs text-slate-500">Loading catalogs…</p>
            )}
            {!loading && error && (
              <div role="alert" className="flex items-center justify-between gap-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                <span>{error}</span>
                <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button>
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <p role="status" className="px-3 py-2 text-xs text-slate-500">No catalogs found.</p>
            )}
          </div>
          {!loading && hasMore && (
            <div className="border-t border-slate-100 p-1">
              <button
                ref={setLoadMoreRef}
                type="button"
                onClick={() => { if (!loadingMore) onLoadMore(); }}
                aria-disabled={loadingMore}
                aria-live="polite"
                className="w-full rounded px-3 py-2 text-left text-xs font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-sky-500 aria-disabled:text-slate-400"
              >
                {loadingMore ? 'Loading catalogs…' : 'Load more catalogs'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
