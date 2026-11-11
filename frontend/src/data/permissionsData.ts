import type { PermissionEnvironment, PermissionMetadata, PermissionObject, RoleAssignment } from '@/types/blueprint';
import { generateRoleName, refreshRole } from '@/lib/permissions';

export const MOCK_PERMISSION_METADATA: PermissionMetadata = {
  permissionOptions: {
    CATALOG: ['USE CATALOG', 'CREATE SCHEMA', 'BROWSE', 'MANAGE'],
    SCHEMA: ['USE SCHEMA', 'CREATE TABLE', 'CREATE VIEW', 'CREATE FUNCTION', 'MANAGE'],
    TABLE: ['SELECT', 'MODIFY', 'APPLY TAG', 'MANAGE'],
    VIEW: ['SELECT', 'MODIFY', 'APPLY TAG', 'MANAGE'],
    FUNCTION: ['EXECUTE'],
  },
  roleTypes: [
    { code: 'user', label: 'User' }, { code: 'support', label: 'Support' },
    { code: 'developer', label: 'Developer' }, { code: 'svc', label: 'Service Account' },
  ],
  formTypes: [
    { code: 'regular', label: 'Regular User Form' },
    { code: 'restricted', label: 'Restricted/Admin Form' },
  ],
};

/** Deterministic demo discovery, not an assertion of actual Databricks grants. */
export function mockExistingRoles(objects: PermissionObject[], environment: PermissionEnvironment, roleTypeCode = 'user'): RoleAssignment[] {
  return objects.filter((object) => object.status === 'EXISTING').map((scope) => {
    const role = refreshRole({
      id: `mock:${environment}:${roleTypeCode}:${scope.objectId}`,
      mode: 'UPDATE_EXISTING', status: 'EXISTING',
      level: scope.objectType === 'CATALOG' ? 'CATALOG' : scope.objectType === 'SCHEMA' ? 'SCHEMA' : 'OBJECT',
      scopeObjectId: scope.objectId, roleTypeCode,
      roleName: generateRoleName({
        level: scope.objectType === 'CATALOG' ? 'CATALOG' : scope.objectType === 'SCHEMA' ? 'SCHEMA' : 'OBJECT',
        scopeObjectId: scope.objectId, roleTypeCode,
      }, environment, objects),
      roleNameManuallyEdited: false, objectPermissions: [],
      requestManager: {
        enabled: true, formType: 'regular', displayName: `${scope.objectName} ${roleTypeCode}`,
        originalValues: { enabled: true, formType: 'regular', displayName: `${scope.objectName} ${roleTypeCode}` },
      },
    }, objects, environment);
    return {
      ...role,
      objectPermissions: role.objectPermissions.map((object) => {
        const permissions = objects.find((item) => item.objectId === object.objectId)?.status === 'EXISTING'
          ? [MOCK_PERMISSION_METADATA.permissionOptions[object.objectType][0]]
          : [];
        return { ...object, originalPermissions: [...permissions], permissions };
      }),
    };
  });
}
