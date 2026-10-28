import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIRECTORY_SEARCH_DEBOUNCE_MS, DIRECTORY_SEARCH_MIN_CHARS } from '@/config/approverConfig';
import type { ApproverService } from '@/services/approverService';
import type { Approver } from '@/types/blueprint';

interface Props {
  /** Accessible name of the search input. */
  label: string;
  service: ApproverService;
  onSelect: (approver: Approver) => void;
  /** Users already selected in this column; shown as "Already added" and not selectable. */
  excludeIds?: string[];
  disabled?: boolean;
  placeholder?: string;
}

type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

/** Debounced, keyboard-accessible directory user combobox (ARIA 1.2 combobox + listbox). */
export function UserPickerTypeahead({
  label, service, onSelect, excludeIds = [], disabled = false, placeholder = 'Search Directory',
}: Props) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Approver[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const term = query.trim();
  const tooShort = term.length < DIRECTORY_SEARCH_MIN_CHARS;

  useEffect(() => {
    if (term.length < DIRECTORY_SEARCH_MIN_CHARS) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const users = await service.searchDirectoryUsers(term, controller.signal);
        if (controller.signal.aborted) return;
        setResults(users);
        setActiveIndex(users.findIndex((user) => !excludeIds.includes(user.id)));
        setStatus('success');
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Directory search failed.');
        setStatus('error');
      }
    }, DIRECTORY_SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
    // excludeIds only affects the initial highlight; a change must not trigger a new search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, service, attempt]);

  const selectable = (index: number) => index >= 0 && index < results.length && !excludeIds.includes(results[index].id);
  const showList = open && !tooShort && status === 'success' && results.length > 0;

  function choose(index: number) {
    if (!selectable(index)) return;
    onSelect(results[index]);
    setQuery('');
    setResults([]);
    setStatus('idle');
    setActiveIndex(-1);
    setOpen(false);
  }

  function move(step: 1 | -1) {
    if (!results.length) return;
    let index = activeIndex;
    for (let i = 0; i < results.length; i += 1) {
      index = (index + step + results.length) % results.length;
      if (selectable(index)) { setActiveIndex(index); return; }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); move(-1); }
    else if (event.key === 'Enter') { if (showList) { event.preventDefault(); choose(activeIndex); } }
    else if (event.key === 'Escape') {
      if (open && !tooShort) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      else if (query) { event.preventDefault(); event.stopPropagation(); setQuery(''); }
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={showList && activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined}
          autoComplete="off"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (event.target.value.trim().length < DIRECTORY_SEARCH_MIN_CHARS) { setStatus('idle'); setResults([]); }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="block w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-8 text-xs placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        {status === 'loading' && !tooShort && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />
        )}
      </div>
      {open && !disabled && term.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-slate-200 bg-white text-xs shadow-lg">
          {tooShort && <p className="px-3 py-2 text-slate-500">Type at least {DIRECTORY_SEARCH_MIN_CHARS} characters to search.</p>}
          {!tooShort && status === 'loading' && <p role="status" className="px-3 py-2 text-slate-500">Searching directory...</p>}
          {!tooShort && status === 'error' && (
            <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 text-rose-700">
              <span>{error}</span>
              <button type="button" className="font-medium underline" onMouseDown={(event) => event.preventDefault()}
                onClick={() => setAttempt((value) => value + 1)}>Retry</button>
            </div>
          )}
          {!tooShort && status === 'success' && results.length === 0 && <p role="status" className="px-3 py-2 text-slate-500">No users found</p>}
          <ul id={listboxId} role="listbox" aria-label={`${label} results`} hidden={!showList} className="max-h-60 overflow-y-auto py-1">
            {showList && results.map((user, index) => {
              const added = excludeIds.includes(user.id);
              return (
                <li
                  key={user.id}
                  id={`${baseId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={added || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => { if (!added) setActiveIndex(index); }}
                  onClick={() => choose(index)}
                  className={cn(
                    'cursor-pointer px-3 py-2',
                    index === activeIndex && 'bg-sky-50',
                    added && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="block font-medium text-slate-900">
                    {user.displayName}{added && <>{' '}<span className="ml-1 font-normal text-slate-500">(Already added)</span></>}
                  </span>
                  <span className="block text-slate-500">{user.email}{user.department ? ` · ${user.department}` : ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
