import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/apiClient';
import { permissionChanges, reconcilePermissions, validatePermissions } from '@/lib/permissions';
import { effectivePermissionResponse, objectsData } from '@/test/permissionFixtures';
import { INITIAL_PERMISSIONS_DATA, type PermissionObject } from '@/types/blueprint';
import { apiPermissionsService, permissionsService, selectedPermissionObjects } from './permissionsService';

vi.mock('@/lib/apiClient', () => ({ default: { post: vi.fn() } }));

const objects = selectedPermissionObjects(objectsData);
const assignment = (securable_type: string, full_name: string, principal: string, privileges: string[]) => ({
  securable_type, full_name, principal, privileges: privileges.map((privilege) => ({ privilege, inherited: false })),
});

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset();
});

describe('permissions API adapter', () => {
  it('binds the production service to the API adapter', () => {
    expect(permissionsService).toBe(apiPermissionsService);
  });

  it('posts qualified names and maps each principal to one independent, editable baseline', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: [
      assignment('CATALOG', 'odx', 'Data Readers', ['USE_CATALOG']),
      assignment('SCHEMA', 'odx.cdm', 'Data Readers', ['USE_SCHEMA']),
      assignment('TABLE', 'odx.cdm.study', 'Data Readers', ['SELECT', 'SELECT', 'APPLY_TAG']),
      assignment('TABLE', 'odx.cdm.study', 'writers', ['MODIFY']),
    ] });
    const roles = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    expect(apiClient.post).toHaveBeenCalledExactlyOnceWith('/api/v1/discovery/privileges', {
      securables: [
        { securable_type: 'CATALOG', full_name: 'odx' },
        { securable_type: 'SCHEMA', full_name: 'odx.cdm' },
        { securable_type: 'TABLE', full_name: 'odx.cdm.study' },
      ],
      include_inherited: true,
    });
    expect(roles.map((role) => role.roleName)).toEqual(['Data Readers', 'writers']);
    const [readers, writers] = roles;
    expect(readers).toMatchObject({
      mode: 'UPDATE_EXISTING', status: 'EXISTING', level: 'CATALOG',
      scopeObjectId: objects[0].objectId, roleTypeCode: '',
      requestManager: { enabled: false, formType: '', displayName: '' },
    });
    expect(readers.objectPermissions.map((item) => item.permissions))
      .toEqual([['USE_CATALOG'], ['USE_SCHEMA'], ['SELECT', 'APPLY_TAG']]);
    expect(writers.objectPermissions.map((item) => item.permissions)).toEqual([[], [], ['MODIFY']]);
    expect(permissionChanges(readers)).toEqual([]);
    readers.objectPermissions[2].permissions = ['APPLY_TAG'];
    expect(readers.objectPermissions[2].originalPermissions).toEqual(['SELECT', 'APPLY_TAG']);
    expect(permissionChanges(readers)).toEqual([{
      objectId: objects[2].objectId, privilege: 'SELECT', changeType: 'REVOKE',
    }]);
    const metadata = await apiPermissionsService.getPermissionMetadata();
    expect(validatePermissions({ roleAssignments: roles, discoveredRoleIds: [] }, 'dev', objects, metadata))
      .toEqual({ roles: {} });
  });

  it('never sends proposed resources and maps materialized views using VIEW', async () => {
    const selected: PermissionObject[] = [
      ...objects.slice(0, 2),
      { ...objects[2], objectType: 'VIEW' },
      { ...objects[2], objectId: 'proposed', objectName: 'new_table', status: 'NEW' },
    ];
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] });
    expect(await apiPermissionsService.getExistingRolesForObjects(selected, 'dev')).toEqual([]);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/discovery/privileges', {
      securables: [
        { securable_type: 'CATALOG', full_name: 'odx' },
        { securable_type: 'SCHEMA', full_name: 'odx.cdm' },
        { securable_type: 'VIEW', full_name: 'odx.cdm.study' },
      ], include_inherited: true,
    });
  });

  it('keeps all API-discovered catalog grants checked and valid without inventing removals', async () => {
    const privileges = [
      'USE_CATALOG', 'CREATE_SCHEMA', 'BROWSE', 'MANAGE', 'EXECUTE',
      'READ_VOLUME', 'SELECT', 'USE_SCHEMA',
    ];
    vi.mocked(apiClient.post).mockResolvedValue({ data: [
      assignment('CATALOG', 'odx', 'existing-readers', privileges),
    ] });
    const roles = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    let data = reconcilePermissions(INITIAL_PERMISSIONS_DATA, objects, roles, 'dev');
    const refreshed = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    data = reconcilePermissions(data, objects, refreshed, 'dev');
    const permission = data.roleAssignments[0].objectPermissions[0];
    expect(permission.permissions).toEqual(privileges);
    expect(permission.permissions).toEqual(permission.originalPermissions);
    expect(permission.permissions).not.toBe(permission.originalPermissions);
    expect(permissionChanges(data.roleAssignments[0])).toEqual([]);
    expect(validatePermissions(data, 'dev', objects, await apiPermissionsService.getPermissionMetadata()))
      .toEqual({ roles: {} });
  });

  it('does not make invalid empty requests when every resource is new', async () => {
    expect(await apiPermissionsService.getExistingRolesForObjects([], 'dev')).toEqual([]);
    expect(await apiPermissionsService.getExistingRolesForObjects(
      objects.map((object) => ({ ...object, status: 'NEW' })), 'dev',
    )).toEqual([]);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('batches at the exact 100-securable backend limit and merges principals across batches', async () => {
    const selected: PermissionObject[] = [
      objects[0],
      ...Array.from({ length: 100 }, (_, index): PermissionObject => ({
        objectId: `s${index}`, objectName: `schema${index}`, objectType: 'SCHEMA',
        status: 'EXISTING', parentId: objects[0].objectId,
      })),
    ];
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: [assignment('SCHEMA', 'odx.schema0', 'readers', ['USE_SCHEMA'])] })
      .mockResolvedValueOnce({ data: [assignment('SCHEMA', 'odx.schema99', 'readers', ['USE_SCHEMA'])] });
    const roles = await apiPermissionsService.getExistingRolesForObjects(selected, 'dev');
    expect(apiClient.post).toHaveBeenCalledTimes(2);
    for (const [index, batch] of [selected.slice(0, 100), selected.slice(100)].entries()) {
      expect(apiClient.post).toHaveBeenNthCalledWith(index + 1, '/api/v1/discovery/privileges', {
        securables: batch.map((object) => ({
          securable_type: object.objectType,
          full_name: object.objectType === 'CATALOG' ? 'odx' : `odx.${object.objectName}`,
        })),
        include_inherited: true,
      });
    }
    expect(roles).toHaveLength(1);
    expect(roles[0].objectPermissions.filter((item) => item.permissions.length)).toHaveLength(2);
  });

  it('filters search using actual principals returned for the selected scope', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: [
      assignment('CATALOG', 'odx', 'Team-Readers', ['USE_CATALOG']),
      assignment('TABLE', 'odx.cdm.study', 'writers', ['MODIFY']),
    ] });
    expect((await apiPermissionsService.searchExistingRoles(' READ ', objects, 'dev')).map((role) => role.roleName))
      .toEqual(['Team-Readers']);
  });

  it('preserves stable identities and local edits when refreshed', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: [
      assignment('TABLE', 'odx.cdm.study', 'readers', ['SELECT']),
    ] });
    const first = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    first[0].objectPermissions[2].permissions = [];
    const refreshed = await apiPermissionsService.getExistingRolesForObjects([...objects].reverse(), 'dev');
    expect(refreshed[0].id).toBe(first[0].id);
    const data = reconcilePermissions({
      roleAssignments: first, discoveredRoleIds: [first[0].id], discoveryEnvironment: 'dev',
    }, objects, refreshed, 'dev');
    expect(data.roleAssignments[0].objectPermissions[2].permissions).toEqual([]);
    const removed = reconcilePermissions({
      ...data, roleAssignments: [],
    }, objects, refreshed, 'dev');
    expect(removed.roleAssignments).toEqual([]);
    const otherEnvironment = await apiPermissionsService.getExistingRolesForObjects(objects, 'stg');
    expect(otherEnvironment[0].id).not.toBe(first[0].id);
  });

  it('does not treat inherited privileges as editable direct grants', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: [{
      ...assignment('TABLE', 'odx.cdm.study', 'readers', ['MODIFY']),
      privileges: [
        { privilege: 'MODIFY', inherited: false },
        { privilege: 'SELECT', inherited: true, inherited_from_type: 'CATALOG', inherited_from_name: 'odx' },
      ],
    }] });
    const [role] = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    expect(role.objectPermissions[2].originalPermissions).toEqual(['MODIFY']);
    expect(role.objectPermissions[2].discoveredAssignments?.[0].privileges).toEqual([
      { privilege: 'MODIFY', inherited: false },
      { privilege: 'SELECT', inherited: true, inherited_from_type: 'CATALOG', inherited_from_name: 'odx' },
    ]);
  });

  it('preserves the full effective API response per principal/resource without mutating it', async () => {
    const response = effectivePermissionResponse.map((item) => Object.freeze({
      ...item, privileges: Object.freeze(item.privileges.map((detail) => Object.freeze({ ...detail }))),
    }));
    const original = structuredClone(response);
    vi.mocked(apiClient.post).mockResolvedValue({ data: response });
    const roles = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    expect(roles.map((role) => role.roleName)).toEqual(['account users', 'inherited-only', 'support-team']);
    for (const role of roles) {
      const snapshots = role.objectPermissions.flatMap((object) => object.discoveredAssignments ?? []);
      expect(snapshots).toEqual(response.filter((item) => item.principal === role.roleName));
      expect(permissionChanges(role)).toEqual([]);
      for (const object of role.objectPermissions) {
        const direct = (object.discoveredAssignments ?? []).flatMap((item) =>
          item.privileges.filter((detail) => !detail.inherited).map((detail) => detail.privilege));
        expect(object.permissions).toEqual(direct);
        expect(object.originalPermissions).toEqual(direct);
        expect(object.permissions).not.toBe(object.originalPermissions);
      }
    }
    const support = roles.find((role) => role.roleName === 'support-team')!;
    expect(support.objectPermissions[1].permissions).toEqual([]);
    support.objectPermissions[0].permissions = [];
    expect(support.objectPermissions[1].discoveredAssignments).toEqual([
      effectivePermissionResponse[1],
    ]);
    expect(response).toEqual(original);
  });

  it('retains principals with empty or inherited-only assignment lists', async () => {
    const data = [
      assignment('CATALOG', 'odx', 'empty-principal', []),
      effectivePermissionResponse[5],
    ];
    vi.mocked(apiClient.post).mockResolvedValue({ data });
    const roles = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    expect(roles).toHaveLength(2);
    expect(roles.flatMap((role) => role.objectPermissions.flatMap((object) => object.discoveredAssignments ?? [])))
      .toEqual(data);
    expect(roles.flatMap(permissionChanges)).toEqual([]);
  });

  it('rejects invalid inheritance metadata instead of silently dropping it', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: [{
      ...assignment('CATALOG', 'odx', 'readers', []),
      privileges: [{ privilege: 'SELECT', inherited: true, inherited_from_name: 123 }],
    }] });
    await expect(apiPermissionsService.getExistingRolesForObjects(objects, 'dev'))
      .rejects.toThrow('invalid privilege');
  });

  it('refreshes API baselines and source metadata without fabricating changes or overwriting explicit edits', async () => {
    const initial = assignment('CATALOG', 'odx', 'readers', ['USE_CATALOG', 'BROWSE']);
    const latest = {
      ...assignment('CATALOG', 'odx', 'readers', ['USE_CATALOG', 'BROWSE', 'READ_VOLUME']),
      privileges: [
        ...assignment('CATALOG', 'odx', 'readers', ['USE_CATALOG', 'BROWSE', 'READ_VOLUME']).privileges,
        { privilege: 'READ_METADATA', inherited: true, inherited_from_type: 'METASTORE', inherited_from_name: 'new-metastore' },
      ],
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: [initial] }).mockResolvedValue({ data: [latest] });
    const initialRoles = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    const initialData = reconcilePermissions(INITIAL_PERMISSIONS_DATA, objects, initialRoles, 'dev');
    const editedData = structuredClone(initialData);
    editedData.roleAssignments[0].objectPermissions[0].permissions = ['USE_CATALOG', 'MANAGE'];
    const refreshed = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    const unedited = reconcilePermissions(initialData, objects, refreshed, 'dev');
    expect(unedited.roleAssignments.flatMap(permissionChanges)).toEqual([]);
    expect(unedited.roleAssignments[0].objectPermissions[0].permissions).toEqual(['USE_CATALOG', 'BROWSE', 'READ_VOLUME']);
    const edited = reconcilePermissions(editedData, objects, refreshed, 'dev');
    expect(edited.roleAssignments[0].objectPermissions[0].originalPermissions).toEqual(['USE_CATALOG', 'BROWSE', 'READ_VOLUME']);
    expect(edited.roleAssignments[0].objectPermissions[0].permissions).toEqual(['USE_CATALOG', 'READ_VOLUME', 'MANAGE']);
    expect(edited.roleAssignments[0].objectPermissions[0].discoveredAssignments).toEqual([latest]);
    expect(edited.roleAssignments.flatMap(permissionChanges)).toEqual([
      { objectId: objects[0].objectId, privilege: 'MANAGE', changeType: 'GRANT' },
      { objectId: objects[0].objectId, privilege: 'BROWSE', changeType: 'REVOKE' },
    ]);
    expect(initialData.roleAssignments[0].objectPermissions[0].permissions).toEqual(['USE_CATALOG', 'BROWSE']);
  });

  it('migrates older space-separated labels without inventing user changes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: [
      assignment('CATALOG', 'odx', 'readers', ['USE_CATALOG', 'READ_VOLUME']),
    ] });
    const roles = await apiPermissionsService.getExistingRolesForObjects(objects, 'dev');
    const older = structuredClone(roles[0]);
    older.objectPermissions[0] = {
      ...older.objectPermissions[0], discoveredAssignments: undefined,
      originalPermissions: ['USE CATALOG', 'READ VOLUME'], permissions: ['USE CATALOG', 'READ VOLUME'],
    };
    const result = reconcilePermissions({
      roleAssignments: [older], discoveredRoleIds: [older.id], discoveryEnvironment: 'dev',
    }, objects, roles, 'dev');
    expect(result.roleAssignments.flatMap(permissionChanges)).toEqual([]);
    expect(result.roleAssignments[0].objectPermissions[0].permissions).toEqual(['USE_CATALOG', 'READ_VOLUME']);
  });

  it.each([
    {},
    [{ principal: 'readers' }],
    [assignment('TABLE', 'other.schema.table', 'readers', ['SELECT'])],
    [{ ...assignment('TABLE', 'odx.cdm.study', 'readers', []), privileges: ['SELECT'] }],
  ])('rejects malformed or out-of-scope API data: %j', async (data) => {
    vi.mocked(apiClient.post).mockResolvedValue({ data });
    await expect(apiPermissionsService.getExistingRolesForObjects(objects, 'dev'))
      .rejects.toThrow('Unexpected privileges response');
  });

  it('surfaces the backend error and never substitutes mock grants', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({
      isAxiosError: true, response: {
        status: 502, data: { detail: { code: 'DATABRICKS_API_ERROR', message: 'Workspace is unavailable.' } },
      },
    });
    await expect(apiPermissionsService.getExistingRolesForObjects(objects, 'dev'))
      .rejects.toThrow('Workspace is unavailable.');
  });

  it('fails the whole discovery if a later batch fails', async () => {
    const selected = [...objects, ...Array.from({ length: 100 }, (_, index): PermissionObject => ({
      ...objects[2], objectId: `t${index}`, objectName: `table${index}`,
    }))];
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: [assignment('CATALOG', 'odx', 'readers', ['USE_CATALOG'])] })
      .mockRejectedValueOnce(new Error('Connection lost'));
    await expect(apiPermissionsService.getExistingRolesForObjects(selected, 'dev')).rejects.toThrow('Connection lost');
  });

  it('rejects unsupported types and invalid hierarchies before making requests', async () => {
    for (const selected of [
      [{ ...objects[2], objectType: 'FUNCTION' as const }],
      [objects[2]],
      [{ ...objects[0], parentId: objects[0].objectId }],
      [{ ...objects[0], objectName: 'invalid.catalog' }],
    ]) {
      await expect(apiPermissionsService.getExistingRolesForObjects(selected, 'dev')).rejects.toThrow();
    }
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('explicitly rejects operations for which no backend API exists', async () => {
    await expect(apiPermissionsService.validateRoleName('new-role', 'dev')).rejects.toThrow('not available yet');
    await expect(apiPermissionsService.savePermissionsDraft({
      objects: objectsData, setup: {
        environment: 'dev', name: '', version: '', description: '', businessJustification: '',
      }, permissions: INITIAL_PERMISSIONS_DATA,
    })).rejects.toThrow('Draft saving is not available yet');
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
