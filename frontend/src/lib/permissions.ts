import type {
  BlueprintPermissionsData, PermissionEnvironment, PermissionMetadata, PermissionObject,
  PermissionChange, RoleAssignment, RoleLevel, PermissionsErrors, RequestManagerValues,
} from '../types/blueprint';

export function scopeOptions(level: RoleLevel, objects: PermissionObject[]) {
  return objects.filter((object) => level === 'OBJECT'
    ? !['CATALOG', 'SCHEMA'].includes(object.objectType)
    : object.objectType === level);
}

export function scopedObjects(role: Pick<RoleAssignment, 'scopeObjectId'>, objects: PermissionObject[]) {
  const included = new Set([role.scopeObjectId]);
  let previousSize = -1;
  while (previousSize !== included.size) {
    previousSize = included.size;
    objects.forEach((object) => {
      if (object.parentId && included.has(object.parentId)) included.add(object.objectId);
    });
  }
  return objects.filter((object) => included.has(object.objectId));
}

function token(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function roleNamePrefix(environment: PermissionEnvironment, roleTypeCode: string) {
  return `dbx-${environment}-gpd-${token(roleTypeCode)}-`;
}

export function generateRoleName(
  role: Pick<RoleAssignment, 'level' | 'scopeObjectId' | 'roleTypeCode'>,
  environment: PermissionEnvironment,
  objects: PermissionObject[],
) {
  const scope = objects.find((object) => object.objectId === role.scopeObjectId);
  if (!scope) return '';
  let catalog = scope;
  const visited = new Set<string>();
  while (catalog.parentId && !visited.has(catalog.objectId)) {
    visited.add(catalog.objectId);
    const parent = objects.find((object) => object.objectId === catalog.parentId);
    if (!parent) return '';
    catalog = parent;
  }
  return roleNamePrefix(environment, role.roleTypeCode) + token(catalog.objectName)
    + (role.level === 'CATALOG' ? '' : `-${token(scope.objectName)}`);
}

export function refreshRole(
  role: RoleAssignment, objects: PermissionObject[], environment: PermissionEnvironment,
): RoleAssignment {
  const candidates = scopeOptions(role.level, objects);
  const scopeObjectId = role.status === 'NEW' && !candidates.some((object) => object.objectId === role.scopeObjectId)
    ? candidates[0]?.objectId ?? ''
    : role.scopeObjectId;
  const scoped = scopedObjects({ scopeObjectId }, objects);
  const next = { ...role, scopeObjectId, objectPermissions: scoped.map((object) => {
    const current = role.objectPermissions.find((permission) => permission.objectId === object.objectId);
    return {
      objectId: object.objectId, objectName: object.objectName, objectType: object.objectType,
      originalPermissions: current?.originalPermissions ?? [],
      permissions: current?.permissions ?? [],
    };
  }) };
  return next.status === 'NEW' && !next.roleNameManuallyEdited
    ? { ...next, roleName: generateRoleName(next, environment, objects) }
    : next;
}

export function createRole(id: string, objects: PermissionObject[], environment: PermissionEnvironment, roleTypeCode: string): RoleAssignment {
  return refreshRole({
    id, mode: 'CREATE_NEW', status: 'NEW', level: 'CATALOG', scopeObjectId: '',
    roleTypeCode, roleName: '', roleNameManuallyEdited: false, objectPermissions: [],
    requestManager: {
      enabled: false, formType: '', displayName: '',
      originalValues: { enabled: false, formType: '', displayName: '' },
    },
  }, objects, environment);
}

export function reconcilePermissions(
  data: BlueprintPermissionsData, objects: PermissionObject[],
  existingRoles: RoleAssignment[], environment: PermissionEnvironment,
): BlueprintPermissionsData {
  const sameEnvironment = !data.discoveryEnvironment || data.discoveryEnvironment === environment;
  const knownIds = new Set(sameEnvironment ? data.discoveredRoleIds : []);
  const roles = data.roleAssignments
    .filter((role) => role.status === 'NEW' || (sameEnvironment && objects.some((object) => object.objectId === role.scopeObjectId)))
    .map((role) => {
      const discovered = existingRoles.find((item) => item.id === role.id);
      const withNewObjects = discovered ? {
        ...role,
        objectPermissions: [
          ...role.objectPermissions,
          ...discovered.objectPermissions.filter((object) => !role.objectPermissions.some((current) => current.objectId === object.objectId)),
        ],
      } : role;
      return refreshRole(withNewObjects, objects, environment);
    });
  for (const role of existingRoles) {
    if (!knownIds.has(role.id) && !roles.some((current) => current.id === role.id)) {
      roles.push(refreshRole(role, objects, environment));
    }
    knownIds.add(role.id);
  }
  return { roleAssignments: roles, discoveredRoleIds: [...knownIds], discoveryEnvironment: environment };
}

export function permissionChanges(role: RoleAssignment): PermissionChange[] {
  return role.objectPermissions.flatMap((object) => [
    ...object.permissions.filter((privilege) => !object.originalPermissions.includes(privilege))
      .map((privilege): PermissionChange => ({ objectId: object.objectId, privilege, changeType: 'GRANT' })),
    ...object.originalPermissions.filter((privilege) => !object.permissions.includes(privilege))
      .map((privilege): PermissionChange => ({ objectId: object.objectId, privilege, changeType: 'REVOKE' })),
  ]);
}

export function activeRequestManager(values: RequestManagerValues): RequestManagerValues {
  return values.enabled ? { enabled: true, formType: values.formType, displayName: values.displayName }
    : { enabled: false, formType: '', displayName: '' };
}

export function requestManagerChanges(role: RoleAssignment) {
  const current = activeRequestManager(role.requestManager);
  const original = activeRequestManager(role.requestManager.originalValues);
  return (['enabled', 'formType', 'displayName'] as const).filter((key) => current[key] !== original[key]);
}

export function inheritedCatalogPermissions(role: RoleAssignment, object: PermissionObject, objects: PermissionObject[]) {
  if (object.objectType === 'CATALOG') return [];
  let parent = objects.find((item) => item.objectId === object.parentId);
  const visited = new Set<string>();
  while (parent && parent.objectType !== 'CATALOG' && !visited.has(parent.objectId)) {
    visited.add(parent.objectId);
    parent = objects.find((item) => item.objectId === parent?.parentId);
  }
  return role.objectPermissions.find((item) => item.objectId === parent?.objectId)?.permissions ?? [];
}

export function validatePermissions(
  data: BlueprintPermissionsData, environment: PermissionEnvironment,
  objects: PermissionObject[], metadata: PermissionMetadata,
): PermissionsErrors {
  const errors: PermissionsErrors = { roles: {} };
  if (!data.roleAssignments.length) errors.configuration = 'Create at least one role assignment.';
  for (const role of data.roleAssignments) {
    const fields: PermissionsErrors['roles'][string] = {};
    if (!['CATALOG', 'SCHEMA', 'OBJECT'].includes(role.level)) fields.level = 'Select a level.';
    if (!scopeOptions(role.level, objects).some((object) => object.objectId === role.scopeObjectId)) fields.scopeObjectId = 'Select a valid role scope.';
    if (!metadata.roleTypes.some((type) => type.code === role.roleTypeCode)) fields.roleTypeCode = 'Select a role type.';
    if (!role.roleName.trim()) fields.roleName = 'Role name is required.';
    else if (role.status === 'NEW' && role.roleName.length > 32) fields.roleName = 'Role name must be 32 characters or fewer.';
    else if (role.status === 'NEW') {
      const suffix = role.roleName.slice(roleNamePrefix(environment, role.roleTypeCode).length);
      if (!role.roleName.startsWith(roleNamePrefix(environment, role.roleTypeCode))
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(suffix)
        || (role.level !== 'CATALOG' && !suffix.includes('-'))) {
        fields.roleName = `Use ${roleNamePrefix(environment, role.roleTypeCode)}${role.level === 'CATALOG' ? '<catalog>' : role.level === 'SCHEMA' ? '<catalog>-<schema>' : '<catalog>-<dataset>'}.`;
      }
    }
    if (data.roleAssignments.some((other) => other.id !== role.id && other.roleName.trim().toLowerCase() === role.roleName.trim().toLowerCase())) {
      fields.roleName = 'Role name must be unique in this blueprint.';
    }
    const allowedIds = new Set(scopedObjects(role, objects).map((object) => object.objectId));
    if (role.objectPermissions.some((object) => !allowedIds.has(object.objectId)
      || object.permissions.some((privilege) => !metadata.permissionOptions[object.objectType].includes(privilege)))) {
      fields.objectPermissions = 'One or more privileges are not valid for the selected scope.';
    } else if (role.status === 'NEW'
      && !role.objectPermissions.some((object) => object.permissions.length)) {
      fields.objectPermissions = 'Select at least one privilege for this role.';
    }
    if (role.requestManager.enabled) {
      if (!metadata.formTypes.some((form) => form.code === role.requestManager.formType)) fields.formType = 'Select a form type.';
      if (!role.requestManager.displayName.trim()) fields.displayName = 'Display name is required.';
    }
    if (Object.keys(fields).length) errors.roles[role.id] = fields;
  }
  return errors;
}

export function hasPermissionErrors(errors: PermissionsErrors) {
  return Boolean(errors.configuration || Object.keys(errors.roles).length);
}
