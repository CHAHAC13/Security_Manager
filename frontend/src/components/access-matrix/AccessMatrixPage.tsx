import { useAccessMatrix } from '@/hooks/useAccessMatrix';
import { useAccessMatrixFilters } from '@/hooks/useAccessMatrixFilters';
import { Pagination } from '@/components/ui/Pagination';
import { AccessMatrixFilters } from './AccessMatrixFilters';
import { AccessMatrixTable } from './AccessMatrixTable';
import { AccessMatrixToolbar } from './AccessMatrixToolbar';

export function AccessMatrixPage() {
  const { data, loading, error, refetch } = useAccessMatrix();
  const {
    filters,
    filterOptions,
    paginatedData,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    setCurrentPage,
    updateFilter,
  } = useAccessMatrixFilters(data);

  // Placeholder handlers — wire up real logic when doing API integration
  const handleAddColumn = () => {
    /* TODO: open column editor modal */
  };
  const handleExportCsv = () => {
    /* TODO: trigger CSV download */
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-slate-500">Loading access matrix…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-red-600">Error: {error}</p>
        <button
          onClick={() => refetch()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
              Global Access Matrix
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Access Matrix Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enterprise-wide view of all approved security matrices.
          </p>
        </div>
      </section>

      {/* Filters & toolbar */}
      <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-3">
        <AccessMatrixFilters
          filters={filters}
          options={filterOptions}
          onFilterChange={updateFilter}
        />
        <AccessMatrixToolbar
          searchValue={filters.search}
          onSearchChange={(v) => updateFilter('search', v)}
          onAddColumn={handleAddColumn}
          onExportCsv={handleExportCsv}
        />
      </section>

      {/* Data table + pagination */}
      <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
        <AccessMatrixTable data={paginatedData} />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </section>
    </>
  );
}
