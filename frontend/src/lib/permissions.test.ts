import { describe, expect, it } from 'vitest';
import { MOCK_PERMISSION_METADATA } from '@/data/permissionsData';
import { createMockPermissionsService, selectedPermissionObjects } from '@/services/permissionsService';
import { INITIAL_OBJECTS_DATA, INITIAL_PERMISSIONS_DATA } from '@/types/blueprint';
import type { BlueprintPermissionsData, RoleLevel } from '@/types/blueprint';
import { objects, objectsData } from '@/test/permissionFixtures';
import {
  activeRequestManager, createRole, generateRoleName,
  permissionChanges, reconcilePermissions, refreshRole, requestManagerChanges,
  scopeOptions, scopedObjects, validatePermissions,
} from './permissions';

const newRole = () => createRole('r1', objects, 'dev', 'user');
const config = (role = newRole()): BlueprintPermissionsData => ({ roleAssignments: [role], discoveredRoleIds: [] });
const validate = (data: BlueprintPermissionsData) => validatePermissions(data, 'dev', objects, MOCK_PERMISSION_METADATA);

describe('role names and scopes', () => {
  it.each([
    ['CATALOG', 'c1', 'dbx-dev-gpd-user-odx'],
    ['SCHEMA', 's1', 'dbx-dev-gpd-user-odx-cdm'],
    ['OBJECT', 't1', 'dbx-dev-gpd-user-odx-study'],
  ] satisfies [RoleLevel, string, string][])('generates %s names', (level, scopeObjectId, expected) => {
    expect(generateRoleName({ level, scopeObjectId, roleTypeCode: 'user' }, 'dev', objects)).toBe(expected);
  });
  it('uses Setup environment and configurable type code', () => {
    expect(generateRoleName({ level: 'CATALOG', scopeObjectId: 'c1', roleTypeCode: 'custom' }, 'prd', objects)).toBe('dbx-prd-gpd-custom-odx');
  });
  it('regenerates automatic names but preserves manually edited names', () => {
    expect(refreshRole({ ...newRole(), roleTypeCode: 'svc' }, objects, 'stg').roleName).toBe('dbx-stg-gpd-svc-odx');
    expect(refreshRole({ ...newRole(), roleNameManuallyEdited: true, roleName: 'custom' }, objects, 'stg').roleName).toBe('custom');
  });
  it('does not silently truncate an overlength recommendation', () => {
    const longObjects = objects.map((object) => object.objectId === 'c1' ? { ...object, objectName: 'a'.repeat(40) } : object);
    expect(createRole('r', longObjects, 'dev', 'user').roleName.length).toBeGreaterThan(32);
  });
  it('only includes the selected scope and its descendants', () => {
    expect(scopedObjects({ scopeObjectId: 's1' }, objects).map((object) => object.objectId)).toEqual(['s1', 't1', 'v1', 'f1']);
  });
});

describe('validation', () => {
  it('requires a role and at least one privilege', () => {
    expect(validate(INITIAL_PERMISSIONS_DATA).configuration).toBeTruthy();
    expect(validate(config()).roles.r1.objectPermissions).toBeTruthy();
  });
  it.each(['', 'x'.repeat(33), 'wrong-prefix', 'dbx-dev-gpd-user-ODX', 'dbx-dev-gpd-user-odx '])('rejects invalid name %s', (roleName) => {
    expect(validate(config({ ...newRole(), roleName })).roles.r1.roleName).toBeTruthy();
  });
  it('accepts 32 characters and rejects 33', () => {
    const prefix = 'dbx-dev-gpd-user-';
    expect(validate(config({ ...newRole(), roleName: prefix + 'a'.repeat(32 - prefix.length) })).roles.r1.roleName).toBeUndefined();
    expect(validate(config({ ...newRole(), roleName: prefix + 'a'.repeat(33 - prefix.length) })).roles.r1.roleName).toBeTruthy();
  });
  it('requires an additional scope token for schema and object names', () => {
    const role = refreshRole({ ...newRole(), level: 'SCHEMA', scopeObjectId: 's1' }, objects, 'dev');
    expect(validate(config({ ...role, roleName: 'dbx-dev-gpd-user-odx' })).roles.r1.roleName).toBeTruthy();
  });
  it('detects blueprint duplicates case-insensitively', () => {
    const role = newRole();
    expect(validate({ ...config(role), roleAssignments: [role, { ...role, id: 'r2', roleName: role.roleName.toUpperCase() }] }).roles.r1.roleName).toMatch(/unique/);
  });
  it('requires a configured type and a valid scope', () => {
    const errors = validate(config({ ...newRole(), roleTypeCode: 'invalid', scopeObjectId: 'missing' })).roles.r1;
    expect(errors.roleTypeCode).toBeTruthy();
    expect(errors.scopeObjectId).toBeTruthy();
  });
  it('requires RM fields only when enabled and validates form options', () => {
    const role = newRole();
    expect(validate(config(role)).roles.r1.formType).toBeUndefined();
    role.requestManager = { ...role.requestManager, enabled: true };
    expect(validate(config(role)).roles.r1).toMatchObject({ formType: expect.any(String), displayName: expect.any(String) });
    role.requestManager = { ...role.requestManager, formType: 'regular', displayName: 'Data users' };
    expect(validate(config(role)).roles.r1.formType).toBeUndefined();
  });
  it('rejects privileges belonging to a different object type', () => {
    const role = newRole();
    role.objectPermissions[0].permissions = ['SELECT'];
    expect(validate(config(role)).roles.r1.objectPermissions).toMatch(/not valid/);
  });
  it('accepts discovered originals only on the same role/resource, without allowing arbitrary new grants', () => {
    const role = { ...newRole(), status: 'EXISTING' as const };
    role.objectPermissions[0] = {
      ...role.objectPermissions[0], originalPermissions: ['READ VOLUME', 'EXECUTE', 'SELECT'],
      permissions: ['READ VOLUME', 'EXECUTE', 'SELECT'],
    };
    expect(validate(config(role))).toEqual({ roles: {} });
    const otherRole = { ...newRole(), id: 'r2', status: 'EXISTING' as const, roleName: 'other-role' };
    otherRole.objectPermissions[0].permissions = ['READ VOLUME'];
    expect(validate(config(otherRole)).roles.r2.objectPermissions).toMatch(/not valid/);
    role.objectPermissions[1].permissions = ['READ VOLUME'];
    expect(validate(config(role)).roles.r1.objectPermissions).toMatch(/not valid/);
  });
  it('preserves read-only existing names instead of applying a newly generated prefix', () => {
    const role = { ...newRole(), status: 'EXISTING' as const, roleName: 'dbx-prd-gpd-user-legacy' };
    expect(validate(config(role))).toEqual({ roles: {} });
  });
  it('accepts long existing names without renaming them while still rejecting empty names', async () => {
    const selected = [{ ...objects[0], objectName: 'gpdip_iconfirecrest_share_prod' }];
    const roles = await createMockPermissionsService().getExistingRolesForObjects(selected, 'dev');
    expect(roles[0].roleName).toHaveLength(47);
    expect(validatePermissions({ roleAssignments: roles, discoveredRoleIds: [] }, 'dev', selected, MOCK_PERMISSION_METADATA))
      .toEqual({ roles: {} });
    expect(validate(config({ ...roles[0], id: 'r1', scopeObjectId: 'c1', roleName: '' })).roles.r1.roleName)
      .toBe('Role name is required.');
  });
  it('allows revoking every existing privilege and retains each revoke operation', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    const role = {
      ...roles[0],
      objectPermissions: roles[0].objectPermissions.map((object) => ({ ...object, permissions: [] })),
    };
    expect(validate(config(role))).toEqual({ roles: {} });
    expect(permissionChanges(role)).toHaveLength(4);
    expect(permissionChanges(role).every((change) => change.changeType === 'REVOKE')).toBe(true);
    expect(role.objectPermissions.find((object) => object.objectId === 't1')?.originalPermissions).toEqual(['SELECT']);
  });
  it('still rejects out-of-scope permission entries even when all grants are empty', () => {
    const role = { ...newRole(), status: 'EXISTING' as const };
    role.objectPermissions.push({ ...role.objectPermissions[0], objectId: 'outside', permissions: [] });
    expect(validate(config(role)).roles.r1.objectPermissions).toMatch(/not valid/);
  });
});

describe('change tracking and inheritance', () => {
  it('computes grants and revokes without mutating originals', () => {
    const role = newRole();
    role.objectPermissions[0] = { ...role.objectPermissions[0], originalPermissions: Object.freeze(['USE CATALOG', 'BROWSE']), permissions: ['USE CATALOG', 'MANAGE'] };
    expect(permissionChanges(role)).toEqual([
      { objectId: 'c1', privilege: 'MANAGE', changeType: 'GRANT' },
      { objectId: 'c1', privilege: 'BROWSE', changeType: 'REVOKE' },
    ]);
    expect(role.objectPermissions[0].originalPermissions).toEqual(['USE CATALOG', 'BROWSE']);
    role.objectPermissions[0].permissions = ['USE CATALOG', 'BROWSE'];
    expect(permissionChanges(role)).toEqual([]);
  });
  it('does not invent child permissions or inheritance when catalog grants are edited', () => {
    const role = newRole();
    role.objectPermissions[0].permissions = ['USE CATALOG', 'BROWSE'];
    expect(role.objectPermissions[2].permissions).toEqual([]);
    expect(role.objectPermissions[2].discoveredAssignments).toBeUndefined();
    expect(permissionChanges(role).every((change) => change.objectId === 'c1')).toBe(true);
  });
  it('tracks RM changes against immutable original settings and clears disabled values', () => {
    const role = newRole();
    role.requestManager = { ...role.requestManager, enabled: true, formType: 'regular', displayName: 'Users' };
    expect(requestManagerChanges(role)).toEqual(['enabled', 'formType', 'displayName']);
    expect(activeRequestManager({ ...role.requestManager, enabled: false })).toEqual({ enabled: false, formType: '', displayName: '' });
  });
});

describe('reconciliation', () => {
  it('adds objects, removes objects, preserves selections and avoids duplicates', () => {
    const role = newRole();
    role.objectPermissions.find((object) => object.objectId === 't1')!.permissions = ['SELECT'];
    const changedObjects = [...objects.filter((object) => object.objectId !== 'v1'), { ...objects[2], objectId: 't2', objectName: 'site' }];
    const result = reconcilePermissions(config(role), changedObjects, [], 'dev');
    expect(result.roleAssignments[0].objectPermissions.find((object) => object.objectId === 't1')?.permissions).toEqual(['SELECT']);
    expect(result.roleAssignments[0].objectPermissions.some((object) => object.objectId === 'v1')).toBe(false);
    expect(result.roleAssignments[0].objectPermissions.find((object) => object.objectId === 't2')?.permissions).toEqual([]);
    expect(reconcilePermissions(result, changedObjects, [], 'dev')).toEqual(result);
  });
  it('discovers roles once and does not resurrect deliberately removed assignments', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    const first = reconcilePermissions(INITIAL_PERMISSIONS_DATA, objects, roles, 'dev');
    const removed = { ...first, roleAssignments: first.roleAssignments.slice(1) };
    const result = reconcilePermissions(removed, objects, roles, 'dev');
    expect(result.roleAssignments.map((role) => role.id)).toEqual(removed.roleAssignments.map((role) => role.id));
    expect(new Set(result.discoveredRoleIds).size).toBe(roles.length);
  });
  it('loads original grants for newly selected existing descendants', async () => {
    const service = createMockPermissionsService();
    const previousObjects = objects.filter((object) => object.objectId !== 't1');
    const previousRoles = await service.getExistingRolesForObjects(previousObjects, 'dev');
    const previous = reconcilePermissions(INITIAL_PERMISSIONS_DATA, previousObjects, previousRoles, 'dev');
    const result = reconcilePermissions(previous, objects, await service.getExistingRolesForObjects(objects, 'dev'), 'dev');
    expect(result.roleAssignments[0].objectPermissions.find((object) => object.objectId === 't1')?.originalPermissions).toEqual(['SELECT']);
  });
  it('replaces existing discovery on environment change while retaining new roles', async () => {
    const service = createMockPermissionsService();
    const first = reconcilePermissions(config(), objects, await service.getExistingRolesForObjects(objects, 'dev'), 'dev');
    const result = reconcilePermissions(first, objects, await service.getExistingRolesForObjects(objects, 'prd'), 'prd');
    expect(result.roleAssignments[0].roleName).toBe('dbx-prd-gpd-user-odx');
    expect(result.roleAssignments.filter((role) => role.status === 'EXISTING').every((role) => role.id.includes(':prd:'))).toBe(true);
  });
  it('removes existing roles whose scope was deselected', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    const first = reconcilePermissions(INITIAL_PERMISSIONS_DATA, objects, roles, 'dev');
    expect(reconcilePermissions(first, objects.slice(0, 1), roles.slice(0, 1), 'dev').roleAssignments).toHaveLength(1);
  });
  it('supports multiple catalogs with duplicate display names and separate scopes', () => {
    const multiple = [...objects, { ...objects[0], objectId: 'c2' }, { ...objects[1], objectId: 's2', parentId: 'c2' }];
    expect(scopedObjects({ scopeObjectId: 'c2' }, multiple).map((object) => object.objectId)).toEqual(['c2', 's2']);
  });
});

describe('selection and mock service boundaries', () => {
  it('names mock roles from their environment, type and scope without suffixes', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'prd');
    expect(roles.map((role) => role.roleName)).toEqual([
      'dbx-prd-gpd-user-odx', 'dbx-prd-gpd-user-odx-cdm',
      'dbx-prd-gpd-user-odx-study', 'dbx-prd-gpd-user-odx-lookup',
    ]);
  });
  it('includes system schemas and their children in role scopes, mock roles and grants', async () => {
    const selected = [
      ...objects,
      { ...objects[1], objectId: 'system-schema', objectName: 'information_schema' },
      { ...objects[2], objectId: 'system-table', parentId: 'system-schema' },
    ];
    expect(scopeOptions('SCHEMA', selected).some((object) => object.objectId === 'system-schema')).toBe(true);
    expect(scopedObjects({ scopeObjectId: 'system-schema' }, selected).map((object) => object.objectId))
      .toEqual(['system-schema', 'system-table']);
    const roles = await createMockPermissionsService().getExistingRolesForObjects(selected, 'dev');
    expect(roles).toHaveLength(6);
    expect(roles[0].objectPermissions.map((object) => object.objectId)).toEqual(selected.map((object) => object.objectId));
  });
  it('maps selected hierarchy from wizard snapshots using stable IDs', () => {
    const selected = selectedPermissionObjects(objectsData);
    expect(selected.map((object) => object.objectType)).toEqual(['CATALOG', 'SCHEMA', 'TABLE']);
    expect(selected[2].parentId).toBe(selected[1].objectId);
    const renamed = selectedPermissionObjects({ ...objectsData, selectedObjects: [{ ...objectsData.selectedObjects[0], name: 'renamed' }] });
    expect(renamed[2].objectId).toBe(selected[2].objectId);
  });
  it('handles no selection and reports missing metadata explicitly', () => {
    expect(selectedPermissionObjects(INITIAL_OBJECTS_DATA)).toEqual([]);
    expect(() => selectedPermissionObjects({ ...INITIAL_OBJECTS_DATA, selectedCatalogId: 'missing' })).toThrow(/details are missing/);
    expect(() => selectedPermissionObjects({ ...objectsData, selectedObjects: [] })).toThrow(/object details are missing/);
    expect(() => selectedPermissionObjects({ ...objectsData, selectedSchemaIds: [] })).toThrow(/outside the selected schemas/);
  });
  it('marks proposals new and does not grant original permissions on new children', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    expect(roles[0].objectPermissions.find((object) => object.objectId === 'v1')?.originalPermissions).toEqual([]);
  });
  it('returns independent mock results and searches role names', async () => {
    const service = createMockPermissionsService();
    const metadata = await service.getPermissionMetadata();
    metadata.roleTypes.length = 0;
    expect((await service.getPermissionMetadata()).roleTypes).toHaveLength(4);
    const found = await service.searchExistingRoles('support', objects, 'dev');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((role) => role.roleTypeCode === 'support')).toBe(true);
    expect(await service.validateRoleName('anything', 'dev')).toEqual({ valid: true });
  });
});
