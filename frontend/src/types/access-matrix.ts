/** Supported deployment environments */
export type Environment = 'Dev' | 'Stg' | 'Prd';

/** RM Form / access classification */
export type RmFormType = 'Reg User' | 'Restricted' | 'Admin' | 'Service';

/** A single row in the Access Matrix */
export interface AccessMatrixEntry {
  id: string;
  blueprintName: string;
  version: string;
  environment: Environment;
  roleName: string;
  privilege: string;
  techApprover: string;
  rmForm: RmFormType;
}

/** Filter state for the Access Matrix table */
export interface AccessMatrixFilters {
  blueprint: string | null;
  version: string | null;
  environment: Environment | null;
  roleName: string | null;
  techApprover: string | null;
  rmForm: RmFormType | null;
  search: string;
}

/** Pagination state */
export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
}

/** Navigation item for the sidebar */
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  isActive?: boolean;
}
