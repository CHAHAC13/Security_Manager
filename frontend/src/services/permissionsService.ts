import { MOCK_PERMISSION_METADATA, mockExistingRoles } from '@/data/permissionsData';
import type {
  BlueprintFormData, BlueprintObjectsData, PermissionEnvironment, PermissionMetadata,
  PermissionObject, RoleAssignment, PermissionsErrors,
} from '@/types/blueprint';

export interface RoleNameValidation {
  valid: boolean;
  message?: string;
}

export interface PermissionsService {
  getSelectedObjects(data: BlueprintObjectsData): Promise<PermissionObject[]>;
  getPermissionMetadata(): Promise<PermissionMetadata>;
  getExistingRolesForObjects(objects: PermissionObject[], environment: PermissionEnvironment): Promise<RoleAssignment[]>;
  searchExistingRoles(query: string, objects: PermissionObject[], environment: PermissionEnvironment): Promise<RoleAssignment[]>;
  validateRoleName(name: string, environment: PermissionEnvironment): Promise<RoleNameValidation>;
  savePermissionsDraft(payload: BlueprintFormData): Promise<void>;
}

/** Adapters can use this error to render server field errors through the same UI. */
export class PermissionsValidationError extends Error {
  readonly errors: PermissionsErrors;
  constructor(message: string, errors: PermissionsErrors) {
    super(message);
    this.name = 'PermissionsValidationError';
    this.errors = errors;
  }
}

function resourceId(...parts: string[]) {
  return JSON.stringify(parts);
}

/** The wizard owns selection; no secondary object selection or discovery calls. */
export function selectedPermissionObjects(data: BlueprintObjectsData): PermissionObject[] {
  if (!data.selectedCatalogId) return [];
  const catalog = data.selectedCatalog
    ?? data.proposedCatalogs.find((item) => item.id === data.selectedCatalogId);
  if (!catalog) throw new Error('Selected catalog details are missing. Return to Objects and select the catalog again.');
  if (data.selectedObjectIds.some((id) => !data.selectedObjects.some((object) =>
    object.id === id && data.selectedSchemaIds.includes(object.schemaId)))) {
    throw new Error('Selected object details are missing or outside the selected schemas. Return to Objects and select the objects again.');
  }
  const catalogId = resourceId('catalog', catalog.id);
  const result: PermissionObject[] = [{
    objectId: catalogId, objectName: catalog.name, objectType: 'CATALOG', parentId: null,
    status: data.proposedCatalogs.some((item) => item.id === catalog.id) ? 'NEW' : 'EXISTING',
  }];
  for (const schemaId of new Set(data.selectedSchemaIds)) {
    const schema = data.selectedSchemas?.find((item) => item.id === schemaId)
      ?? data.proposedSchemas.find((item) => item.id === schemaId && item.catalogId === catalog.id);
    if (!schema) throw new Error('Selected schema details are missing. Return to Objects and select the schema again.');
    const id = resourceId('schema', catalog.id, schema.id);
    result.push({
      objectId: id, objectName: schema.name, objectType: 'SCHEMA', parentId: catalogId,
      status: data.proposedSchemas.some((item) => item.id === schema.id) ? 'NEW' : 'EXISTING',
    });
    for (const objectId of new Set(data.selectedObjectIds)) {
      const object = data.selectedObjects.find((item) => item.id === objectId && item.schemaId === schema.id);
      if (!object) continue;
      result.push({
        objectId: resourceId('object', catalog.id, schema.id, object.id),
        objectName: object.name, parentId: id,
        objectType: object.kind === 'table' ? 'TABLE' : 'VIEW',
        status: object.source === 'new' ? 'NEW' : 'EXISTING',
      });
    }
  }
  return result;
}

export function createMockPermissionsService(): PermissionsService {
  return {
    async getSelectedObjects(data) { return selectedPermissionObjects(data); },
    async getPermissionMetadata() { return structuredClone(MOCK_PERMISSION_METADATA); },
    async getExistingRolesForObjects(objects, environment) {
      return mockExistingRoles(objects, environment);
    },
    async searchExistingRoles(query, objects, environment) {
      return [...mockExistingRoles(objects, environment), ...mockExistingRoles(objects, environment, 'support')]
        .filter((role) => role.roleName.toLowerCase().includes(query.trim().toLowerCase()));
    },
    async validateRoleName() { return { valid: true }; },
    async savePermissionsDraft(payload) {
      // Validate the mock's serializable boundary without claiming durable storage.
      structuredClone(payload);
    },
  };
}

// TODO(API): Replace this binding with an adapter implementing PermissionsService
// when endpoints/contracts exist. Do not import transport or fixtures in the UI.
export const permissionsService = createMockPermissionsService();
