import type {
  AccessMatrixFilters as Filters,
  Environment,
  RmFormType,
} from '@/types/access-matrix';
import { FilterDropdown } from '@/components/ui/FilterDropdown';

interface AccessMatrixFiltersProps {
  filters: Filters;
  options: {
    blueprints: string[];
    versions: string[];
    environments: Environment[];
    roleNames: string[];
    techApprovers: string[];
    rmForms: RmFormType[];
  };
  onFilterChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}

export function AccessMatrixFilters({
  filters,
  options,
  onFilterChange,
}: AccessMatrixFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterDropdown
        label="Blueprint"
        options={options.blueprints}
        value={filters.blueprint}
        onChange={(v) => onFilterChange('blueprint', v)}
      />
      <FilterDropdown
        label="Version"
        options={options.versions}
        value={filters.version}
        onChange={(v) => onFilterChange('version', v)}
      />
      <FilterDropdown
        label="Environment"
        options={options.environments}
        value={filters.environment}
        onChange={(v) => onFilterChange('environment', v as Environment | null)}
      />
      <FilterDropdown
        label="Role Name"
        options={options.roleNames}
        value={filters.roleName}
        onChange={(v) => onFilterChange('roleName', v)}
      />
      <FilterDropdown
        label="Tech Approver"
        options={options.techApprovers}
        value={filters.techApprover}
        onChange={(v) => onFilterChange('techApprover', v)}
      />
      <FilterDropdown
        label="RM Form"
        options={options.rmForms}
        value={filters.rmForm}
        onChange={(v) => onFilterChange('rmForm', v as RmFormType | null)}
      />
    </div>
  );
}
