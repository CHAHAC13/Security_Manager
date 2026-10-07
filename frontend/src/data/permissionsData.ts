import type {
  RoleOption,
  Privilege,
  PermissionEnvironment,
  RmForm,
} from '@/types/blueprint';

/* ── Available roles ── */
export const MOCK_ROLES: RoleOption[] = [
  { id: 'role-1', name: 'dbx-prd-gpd-user-odx-clinops', description: 'Production ClinOps read access' },
  { id: 'role-2', name: 'dbx-stg-gpd-user-odx-clinops', description: 'Staging ClinOps read access' },
  { id: 'role-3', name: 'dbx-dev-gpd-user-odx-clinops', description: 'Dev ClinOps read access' },
  { id: 'role-4', name: 'dbx-prd-gpd-user-odx-clinops-cdm', description: 'Production ClinOps CDM read access' },
  { id: 'role-5', name: 'dbx-stg-gpd-user-odx-clinops-cdm', description: 'Staging ClinOps CDM read access' },
  { id: 'role-6', name: 'dbx-dev-gpd-user-odx-clinops-cdm', description: 'Dev ClinOps CDM read access' },
  { id: 'role-7', name: 'dbx-prd-gpd-user-odx-clinops-veev', description: 'Production ClinOps Veeva access' },
  { id: 'role-8', name: 'dbx-stg-gpd-admin-odx', description: 'Staging ODX admin' },
  { id: 'role-9', name: 'dbx-prd-gpd-svc-etl-outbound', description: 'Production ETL service (outbound)' },
  { id: 'role-10', name: 'dbx-dev-gpd-analyst-analytics', description: 'Dev analyst role' },
];

/* ── Privilege options ── */
export const PRIVILEGE_OPTIONS: Privilege[] = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'MODIFY',
  'ALL PRIVILEGES',
  'USE CATALOG',
  'USE SCHEMA',
];

/* ── Environment options ── */
export const ENVIRONMENT_OPTIONS: PermissionEnvironment[] = ['Dev', 'Stg', 'Prd'];

/* ── RM Form options ── */
export const RM_FORM_OPTIONS: RmForm[] = ['Reg User', 'Restricted', 'Admin', 'Service'];

/**
 * Simulate an API call to fetch available roles.
 */
export function getAvailableRoles(): RoleOption[] {
  return MOCK_ROLES;
}
