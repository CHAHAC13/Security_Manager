import type { BlueprintObjectsData, DiscoveredPermissionAssignment, DiscoveredPrivilege, PermissionObject } from '@/types/blueprint';
import { INITIAL_OBJECTS_DATA } from '@/types/blueprint';

export const objects: PermissionObject[] = [
  { objectId: 'c1', objectName: 'odx', objectType: 'CATALOG', status: 'EXISTING', parentId: null },
  { objectId: 's1', objectName: 'cdm', objectType: 'SCHEMA', status: 'EXISTING', parentId: 'c1' },
  { objectId: 't1', objectName: 'study', objectType: 'TABLE', status: 'EXISTING', parentId: 's1' },
  { objectId: 'v1', objectName: 'contacts', objectType: 'VIEW', status: 'NEW', parentId: 's1' },
  { objectId: 'f1', objectName: 'lookup', objectType: 'FUNCTION', status: 'EXISTING', parentId: 's1' },
];

export const objectsData: BlueprintObjectsData = {
  ...INITIAL_OBJECTS_DATA,
  selectedCatalogId: 'cat',
  selectedCatalog: { id: 'cat', name: 'odx' },
  selectedSchemaIds: ['sch'],
  selectedSchemas: [{ id: 'sch', name: 'cdm', catalogId: 'cat' }],
  selectedObjectIds: ['table'],
  selectedObjects: [{ id: 'table', name: 'study', schemaId: 'sch', kind: 'table', source: 'existing' }],
};

function direct(privilege: string): DiscoveredPrivilege {
  return { privilege, inherited: false, inherited_from_type: null, inherited_from_name: null };
}

function inherited(privilege: string, type: string, name: string): DiscoveredPrivilege {
  return { privilege, inherited: true, inherited_from_type: type, inherited_from_name: name };
}

export const effectivePermissionResponse: DiscoveredPermissionAssignment[] = [
  {
    securable_type: 'CATALOG', full_name: 'odx', principal: 'support-team',
    privileges: ['BROWSE', 'EXECUTE', 'READ_VOLUME', 'SELECT', 'USE_CATALOG', 'USE_SCHEMA'].map(direct),
  },
  {
    securable_type: 'SCHEMA', full_name: 'odx.cdm', principal: 'support-team',
    privileges: ['EXECUTE', 'READ_VOLUME', 'SELECT', 'USE_SCHEMA'].map((privilege) => inherited(privilege, 'CATALOG', 'odx')),
  },
  {
    securable_type: 'TABLE', full_name: 'odx.cdm.study', principal: 'support-team',
    privileges: [inherited('SELECT', 'CATALOG', 'odx')],
  },
  {
    securable_type: 'SCHEMA', full_name: 'odx.cdm', principal: 'account users',
    privileges: [direct('USE_SCHEMA')],
  },
  {
    securable_type: 'TABLE', full_name: 'odx.cdm.study', principal: 'account users',
    privileges: [direct('SELECT')],
  },
  {
    securable_type: 'CATALOG', full_name: 'odx', principal: 'inherited-only',
    privileges: [inherited('READ_METADATA', 'METASTORE', 'test-metastore')],
  },
];
