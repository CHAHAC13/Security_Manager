/** Step identifiers for the 5-step blueprint wizard. */
export type BlueprintStep = 1 | 2 | 3 | 4 | 5;

export interface BlueprintStepMeta {
  step: BlueprintStep;
  label: string;
}

export const BLUEPRINT_STEPS: BlueprintStepMeta[] = [
  { step: 1, label: 'Setup' },
  { step: 2, label: 'Objects' },
  { step: 3, label: 'Permissions' },
  { step: 4, label: 'Approvers' },
  { step: 5, label: 'Review' },
];

/** Form data for Step 1: Blueprint Setup. */
export interface BlueprintSetupData {
  name: string;
  version: string;
  description: string;
  businessJustification: string;
}

/**
 * Top-level blueprint form data across all steps.
 * Extend this as new steps are implemented.
 */
export interface BlueprintFormData {
  setup: BlueprintSetupData;
  objects: BlueprintObjectsData;
  permissions: BlueprintPermissionsData;
  // approvers: BlueprintApproversData;
}

export const INITIAL_SETUP_DATA: BlueprintSetupData = {
  name: '',
  version: 'v1.0',
  description: '',
  businessJustification: '',
};

/* ── Step 2: Object Scope types ── */

export type ObjectKind = 'table' | 'view' | 'materialized_view';

export type ValidationStatus = 'validated' | 'pending' | 'error';

export interface CatalogOption {
  id: string;
  name: string;
}

export interface SchemaOption {
  id: string;
  name: string;
  catalogId: string;
  tag: string;
  objectCount: number;
}

export interface ObjectOption {
  id: string;
  name: string;
  schemaId: string;
  kind: ObjectKind;
  status: ValidationStatus;
}

/** Form data for Step 2: Object Scope. */
export interface BlueprintObjectsData {
  selectedCatalogId: string;
  selectedSchemaIds: string[];
  selectedObjectIds: string[];
  /** Which schema is currently expanded to show its objects. */
  focusedSchemaId: string | null;
}

export const INITIAL_OBJECTS_DATA: BlueprintObjectsData = {
  selectedCatalogId: '',
  selectedSchemaIds: [],
  selectedObjectIds: [],
  focusedSchemaId: null,
};

/* ── Step 3: Permissions types ── */

export type Privilege =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'ALL PRIVILEGES'
  | 'MODIFY'
  | 'USE CATALOG'
  | 'USE SCHEMA';

export type PermissionEnvironment = 'Dev' | 'Stg' | 'Prd';

export type RmForm = 'Reg User' | 'Restricted' | 'Admin' | 'Service';

export interface RoleOption {
  id: string;
  name: string;
  description: string;
}

/** A single permission assignment row. */
export interface PermissionAssignment {
  id: string;
  roleId: string;
  objectId: string;
  privilege: Privilege;
  environment: PermissionEnvironment;
  rmForm: RmForm;
}

/** Form data for Step 3: Permissions. */
export interface BlueprintPermissionsData {
  assignments: PermissionAssignment[];
}

export const INITIAL_PERMISSIONS_DATA: BlueprintPermissionsData = {
  assignments: [],
};
