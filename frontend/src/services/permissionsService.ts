import axios from 'axios';
import apiClient from '@/lib/apiClient';
import { MOCK_PERMISSION_METADATA, mockExistingRoles } from '@/data/permissionsData';
import { refreshRole } from '@/lib/permissions';
import type {
  BlueprintFormData, BlueprintObjectsData, PermissionEnvironment, PermissionMetadata,
  PermissionObject, RoleAssignment, PermissionsErrors, DiscoveredPrivilege, DiscoveredPermissionAssignment,
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

type SecurableType = 'CATALOG' | 'SCHEMA' | 'TABLE' | 'VIEW';

interface SecurableSelection {
  securable_type: SecurableType;
  full_name: string;
}

interface SelectedSecurable {
  selection: SecurableSelection;
  object: PermissionObject;
  catalog: PermissionObject;
}

function selectedSecurable(object: PermissionObject, objects: PermissionObject[]): SelectedSecurable {
  if (object.objectType === 'FUNCTION') {
    throw new Error('The privileges API does not support FUNCTION resources.');
  }
  const hierarchy = [object];
  const visited = new Set([object.objectId]);
  let current = object;
  while (current.parentId) {
    const parent = objects.find((item) => item.objectId === current.parentId);
    if (!parent || visited.has(parent.objectId)) {
      throw new Error('Selected resource hierarchy is incomplete or invalid. Return to Objects and select it again.');
    }
    visited.add(parent.objectId);
    hierarchy.unshift(parent);
    current = parent;
  }
  const expectedTypes = object.objectType === 'CATALOG' ? 'CATALOG'
    : object.objectType === 'SCHEMA' ? 'CATALOG,SCHEMA' : `CATALOG,SCHEMA,${object.objectType}`;
  if (hierarchy.map((item) => item.objectType).join(',') !== expectedTypes
    || hierarchy.some((item) => !item.objectName.trim() || item.objectName.includes('.'))) {
    throw new Error('Selected resource names or hierarchy cannot be represented by the privileges API.');
  }
  return {
    selection: { securable_type: object.objectType, full_name: hierarchy.map((item) => item.objectName).join('.') },
    object, catalog: hierarchy[0],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function selectionKey(selection: SecurableSelection) {
  return JSON.stringify([selection.securable_type, selection.full_name]);
}

function isDiscoveredPrivilege(value: unknown): value is DiscoveredPrivilege {
  return isRecord(value) && typeof value.privilege === 'string' && Boolean(value.privilege.trim())
    && typeof value.inherited === 'boolean'
    && (value.inherited_from_type == null || typeof value.inherited_from_type === 'string')
    && (value.inherited_from_name == null || typeof value.inherited_from_name === 'string');
}

function mapAssignments(
  data: unknown, selections: SelectedSecurable[], roles: Map<string, RoleAssignment>,
  objects: PermissionObject[], environment: PermissionEnvironment,
) {
  if (!Array.isArray(data)) throw new Error('Unexpected privileges response: expected a list of assignments.');
  const selected = new Map(selections.map((item) => [selectionKey(item.selection), item]));
  const assignments: unknown[] = data;
  for (const assignment of assignments) {
    if (!isRecord(assignment) || typeof assignment.securable_type !== 'string'
      || typeof assignment.full_name !== 'string' || typeof assignment.principal !== 'string'
      || !assignment.principal.trim() || !Array.isArray(assignment.privileges)) {
      throw new Error('Unexpected privileges response: invalid assignment.');
    }
    const resource = selected.get(JSON.stringify([assignment.securable_type, assignment.full_name]));
    if (!resource) throw new Error('Unexpected privileges response: assignment is outside the requested scope.');
    const permissions: string[] = [];
    const privileges: DiscoveredPrivilege[] = [];
    const details: unknown[] = assignment.privileges;
    for (const detail of details) {
      if (!isDiscoveredPrivilege(detail)) {
        throw new Error('Unexpected privileges response: invalid privilege.');
      }
      privileges.push(Object.freeze({ ...detail }));
      if (!detail.inherited) permissions.push(detail.privilege);
    }
    const principal = assignment.principal;
    const snapshot: DiscoveredPermissionAssignment = Object.freeze({
      ...assignment,
      securable_type: resource.selection.securable_type,
      full_name: assignment.full_name,
      principal,
      privileges: Object.freeze(privileges),
    });
    const id = JSON.stringify(['privileges', environment, resource.catalog.objectId, principal]);
    let role = roles.get(id);
    if (!role) {
      role = refreshRole({
        id, mode: 'UPDATE_EXISTING', status: 'EXISTING',
        level: 'CATALOG', scopeObjectId: resource.catalog.objectId,
        roleTypeCode: '', roleName: principal, roleNameManuallyEdited: false, objectPermissions: [],
        requestManager: {
          enabled: false, formType: '', displayName: '',
          originalValues: { enabled: false, formType: '', displayName: '' },
        },
      }, objects, environment);
      roles.set(id, role);
    }
    role.objectPermissions = role.objectPermissions.map((item) => {
      if (item.objectId !== resource.object.objectId) return item;
      const merged = [...new Set([...item.originalPermissions, ...permissions])];
      return {
        ...item,
        originalPermissions: Object.freeze(merged),
        permissions: [...merged],
        discoveredAssignments: Object.freeze([...(item.discoveredAssignments ?? []), snapshot]),
      };
    });
  }
}

async function loadExistingRoles(objects: PermissionObject[], environment: PermissionEnvironment): Promise<RoleAssignment[]> {
  const selections = objects.filter((object) => object.status === 'EXISTING')
    .map((object) => selectedSecurable(object, objects));
  const roles = new Map<string, RoleAssignment>();
  try {
    // The backend accepts at most 100 securables per request.
    for (let offset = 0; offset < selections.length; offset += 100) {
      const batch = selections.slice(offset, offset + 100);
      const { data } = await apiClient.post<unknown>('/api/v1/discovery/privileges', {
        securables: batch.map((item) => item.selection),
        include_inherited: true,
      });
      mapAssignments(data, batch, roles, objects, environment);
    }
  } catch (error) {
    if (axios.isAxiosError<{ detail?: string | { message?: string } }>(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'string') throw new Error(detail, { cause: error });
      if (detail && typeof detail.message === 'string') throw new Error(detail.message, { cause: error });
      if (error.response?.status) throw new Error(`Permissions request failed (${error.response.status}).`, { cause: error });
    }
    throw error;
  }
  return [...roles.values()].sort((a, b) => a.roleName.localeCompare(b.roleName));
}

export const apiPermissionsService: PermissionsService = {
  async getSelectedObjects(data) { return selectedPermissionObjects(data); },
  // These are local editor options; the discovery API has no metadata endpoint.
  async getPermissionMetadata() {
    const metadata = structuredClone(MOCK_PERMISSION_METADATA);
    for (const options of Object.values(metadata.permissionOptions)) {
      for (let index = 0; index < options.length; index += 1) {
        options[index] = options[index].replaceAll(' ', '_');
      }
    }
    return metadata;
  },
  getExistingRolesForObjects: loadExistingRoles,
  async searchExistingRoles(query, objects, environment) {
    const roles = await loadExistingRoles(objects, environment);
    return roles.filter((role) => role.roleName.toLowerCase().includes(query.trim().toLowerCase()));
  },
  async validateRoleName() {
    throw new Error('Server-side role-name validation is not available yet. New-role validation cannot be completed.');
  },
  async savePermissionsDraft() {
    throw new Error('Draft saving is not available yet. Your changes remain in this wizard only.');
  },
};

export const permissionsService = apiPermissionsService;
