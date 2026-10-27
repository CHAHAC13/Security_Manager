import type { BlueprintObjectsData, PermissionObject } from '@/types/blueprint';
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
