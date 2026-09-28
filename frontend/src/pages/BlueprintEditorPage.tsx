import { useAccessMatrix } from '@/hooks/useAccessMatrix';
import { useAccessMatrixFilters } from '@/hooks/useAccessMatrixFilters';

export function BlueprintEditorPage() {
  const { data, loading, error, refetch } = useAccessMatrix();
  const {
    filters,
    filterOptions,
    paginatedData,
    currentPage,
    totalPages,
    totalItems,
    setCurrentPage,
    updateFilter,
    resetFilters,
  } = useAccessMatrixFilters(data);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-slate-500">Loading access matrix…</p>
      </div>
    );
  }

  /* ── Error state ── */
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Blueprint Editor
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {totalItems} {totalItems === 1 ? 'entry' : 'entries'} found
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.environment ?? ''}
          onChange={(e) =>
            updateFilter('environment', e.target.value || null)
          }
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Environments</option>
          {filterOptions.environments.map((env) => (
            <option key={env} value={env}>
              {env}
            </option>
          ))}
        </select>

        <select
          value={filters.blueprint ?? ''}
          onChange={(e) =>
            updateFilter('blueprint', e.target.value || null)
          }
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Blueprints</option>
          {filterOptions.blueprints.map((bp) => (
            <option key={bp} value={bp}>
              {bp}
            </option>
          ))}
        </select>

        <select
          value={filters.roleName ?? ''}
          onChange={(e) =>
            updateFilter('roleName', e.target.value || null)
          }
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Roles</option>
          {filterOptions.roleNames.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        <button
          onClick={resetFilters}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Reset Filters
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Blueprint', 'Version', 'Environment', 'Role', 'Privilege', 'Tech Approver', 'RM Form'].map(
                (heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-left font-semibold text-slate-700"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No entries match the current filters.
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">{row.blueprintName}</td>
                  <td className="px-4 py-3">{row.version}</td>
                  <td className="px-4 py-3">{row.environment}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.roleName}
                  </td>
                  <td className="px-4 py-3">{row.privilege}</td>
                  <td className="px-4 py-3">{row.techApprover}</td>
                  <td className="px-4 py-3">{row.rmForm}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
