import { useMemo, useState } from 'react';
import type {
  AccessMatrixEntry,
  AccessMatrixFilters,
  Environment,
  RmFormType,
} from '@/types/access-matrix';

const INITIAL_FILTERS: AccessMatrixFilters = {
  blueprint: null,
  version: null,
  environment: null,
  roleName: null,
  techApprover: null,
  rmForm: null,
  search: '',
};

const PAGE_SIZE = 20;

export function useAccessMatrixFilters(data: AccessMatrixEntry[]) {
  const [filters, setFilters] = useState<AccessMatrixFilters>(INITIAL_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  /** Derive unique option values for each dropdown */
  const filterOptions = useMemo(() => {
    const unique = <T,>(arr: T[]) => [...new Set(arr)];
    return {
      blueprints: unique(data.map((d) => d.blueprintName)),
      versions: unique(data.map((d) => d.version)),
      environments: unique(data.map((d) => d.environment)) as Environment[],
      roleNames: unique(data.map((d) => d.roleName)),
      techApprovers: unique(data.map((d) => d.techApprover)),
      rmForms: unique(data.map((d) => d.rmForm)) as RmFormType[],
    };
  }, [data]);

  /** Apply all active filters + free-text search */
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (filters.blueprint && row.blueprintName !== filters.blueprint)
        return false;
      if (filters.version && row.version !== filters.version) return false;
      if (filters.environment && row.environment !== filters.environment)
        return false;
      if (filters.roleName && row.roleName !== filters.roleName) return false;
      if (filters.techApprover && row.techApprover !== filters.techApprover)
        return false;
      if (filters.rmForm && row.rmForm !== filters.rmForm) return false;

      if (filters.search) {
        const q = filters.search.toLowerCase();
        return (
          row.blueprintName.toLowerCase().includes(q) ||
          row.roleName.toLowerCase().includes(q) ||
          row.techApprover.toLowerCase().includes(q) ||
          row.privilege.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [data, filters]);

  /** Paginated slice */
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, currentPage]);

  /** Setters */
  function updateFilter<K extends keyof AccessMatrixFilters>(
    key: K,
    value: AccessMatrixFilters[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1); // reset on filter change
  }

  function resetFilters() {
    setFilters(INITIAL_FILTERS);
    setCurrentPage(1);
  }

  return {
    filters,
    filterOptions,
    filteredData,
    paginatedData,
    currentPage,
    totalPages,
    totalItems: filteredData.length,
    pageSize: PAGE_SIZE,
    setCurrentPage,
    updateFilter,
    resetFilters,
  };
}
