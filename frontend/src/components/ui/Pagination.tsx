import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  /** Build array of page numbers to show (with ellipsis gaps) */
  function getPageNumbers(): (number | '...')[] {
    const pages: (number | '...')[] = [];

    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    if (currentPage > 3) pages.push('...');

    const rangeStart = Math.max(2, currentPage - 1);
    const rangeEnd = Math.min(totalPages - 1, currentPage + 1);
    for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);

    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);

    return pages;
  }

  return (
    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
      <div>
        Showing{' '}
        <span className="font-medium text-slate-700">
          {start}–{end}
        </span>{' '}
        of <span className="font-medium text-slate-700">{totalItems}</span>{' '}
        entries
      </div>

      <div className="flex items-center space-x-1">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className={cn(
            'px-2.5 py-1 rounded border',
            currentPage === 1
              ? 'border-slate-200 bg-white text-slate-400 cursor-not-allowed'
              : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700',
          )}
        >
          Previous
        </button>

        {getPageNumbers().map((page, idx) =>
          page === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={cn(
                'px-2.5 py-1 rounded border',
                page === currentPage
                  ? 'border-sky-600 bg-sky-600 text-white font-medium'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700',
              )}
            >
              {page}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className={cn(
            'px-2.5 py-1 rounded border',
            currentPage === totalPages
              ? 'border-slate-200 bg-white text-slate-400 cursor-not-allowed'
              : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700',
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}
