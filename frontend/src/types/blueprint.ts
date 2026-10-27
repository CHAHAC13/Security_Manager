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
  environment: PermissionEnvironment;
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
  environment: 'dev',
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
  catalogType?: string;
}

export interface SchemaOption {
  id: string;
  name: string;
  catalogId: string;
  tag?: string;
  objectCount?: number;
}

export interface ObjectOption {
  id: string;
  name: string;
  schemaId: string;
  kind: ObjectKind;
  status?: ValidationStatus;
  source?: 'existing' | 'new';
}

export interface ProposedCatalog {
  id: string;
  name: string;
  source: 'new';
}

export interface ProposedSchema {
  id: string;
  name: string;
  catalogId: string;
  source: 'new';
}

export interface ProposedObject extends ObjectOption {
  source: 'new';
}

/** Form data for Step 2: Object Scope. */
export interface BlueprintObjectsData {
  selectedCatalogId: string;
  selectedCatalog?: CatalogOption;
  selectedSchemas?: SchemaOption[];
  selectedSchemaIds: string[];
  selectedObjectIds: string[];
  selectedObjects: ObjectOption[];
  proposedCatalogs: ProposedCatalog[];
  proposedSchemas: ProposedSchema[];
  proposedObjects: ProposedObject[];
  /** Which schema is currently expanded to show its objects. */
  focusedSchemaId: string | null;
}

export const INITIAL_OBJECTS_DATA: BlueprintObjectsData = {
  selectedCatalogId: '',
  selectedSchemaIds: [],
  selectedObjectIds: [],
  selectedObjects: [],
  proposedCatalogs: [],
  proposedSchemas: [],
  proposedObjects: [],
  focusedSchemaId: null,
};

/* ── Step 3: Permissions types ── */

export type PermissionEnvironment = 'dev' | 'stg' | 'prd';
export type PermissionObjectType = 'CATALOG' | 'SCHEMA' | 'TABLE' | 'VIEW' | 'FUNCTION';
export type RoleLevel = 'CATALOG' | 'SCHEMA' | 'OBJECT';
export type ResourceStatus = 'NEW' | 'EXISTING';

export interface PermissionObject {
  objectId: string;
  objectName: string;
  objectType: PermissionObjectType;
  status: ResourceStatus;
  parentId: string | null;
}

export interface ObjectPermission {
  objectId: string;
  objectName: string;
  objectType: PermissionObjectType;
  readonly originalPermissions: readonly string[];
  permissions: string[];
}

export interface RequestManagerValues {
  enabled: boolean;
  formType: string;
  displayName: string;
}

export interface RequestManagerConfiguration extends RequestManagerValues {
  readonly originalValues: Readonly<RequestManagerValues>;
}

export interface RoleAssignment {
  id: string;
  mode: 'CREATE_NEW' | 'UPDATE_EXISTING';
  status: ResourceStatus;
  level: RoleLevel;
  scopeObjectId: string;
  roleTypeCode: string;
  roleName: string;
  roleNameManuallyEdited: boolean;
  objectPermissions: ObjectPermission[];
  requestManager: RequestManagerConfiguration;
}

export interface PermissionChange {
  objectId: string;
  privilege: string;
  changeType: 'GRANT' | 'REVOKE';
}

export interface PermissionOption {
  code: string;
  label: string;
}

export interface PermissionMetadata {
  permissionOptions: Record<PermissionObjectType, string[]>;
  roleTypes: PermissionOption[];
  formTypes: PermissionOption[];
}

export type RoleField = 'level' | 'scopeObjectId' | 'roleTypeCode' | 'roleName' | 'objectPermissions' | 'formType' | 'displayName';
export type RoleErrors = Partial<Record<RoleField, string>>;
export interface PermissionsErrors {
  configuration?: string;
  roles: Record<string, RoleErrors>;
}

export interface BlueprintPermissionsData {
  roleAssignments: RoleAssignment[];
  /** Discovery bookkeeping prevents removed roles from returning on every visit. */
  discoveredRoleIds: string[];
  discoveryEnvironment?: PermissionEnvironment;
}

export const INITIAL_PERMISSIONS_DATA: BlueprintPermissionsData = {
  roleAssignments: [],
  discoveredRoleIds: [],
};
