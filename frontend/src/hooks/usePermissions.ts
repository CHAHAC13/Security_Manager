import { useCallback, useEffect, useRef, useState } from 'react';
import { createBlankRole, reconcilePermissions } from '@/lib/permissions';
import type { BlueprintObjectsData, BlueprintPermissionsData, PermissionEnvironment, PermissionMetadata, PermissionObject, RoleAssignment } from '@/types/blueprint';
import type { PermissionsService } from '@/services/permissionsService';

interface LoadedPermissions {
  objects: PermissionObject[];
  metadata: PermissionMetadata;
}

export function usePermissions(
  objectsData: BlueprintObjectsData,
  data: BlueprintPermissionsData,
  environment: PermissionEnvironment,
  onChange: (value: BlueprintPermissionsData) => void,
  service: PermissionsService,
) {
  const [loaded, setLoaded] = useState<LoadedPermissions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Partial results merge into the latest state so edits made while loading are kept.
  const latestData = useRef(data);
  useEffect(() => { latestData.current = data; }, [data]);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setDiscovering(false);
      setError(null);
      try {
        const [objects, metadata] = await Promise.all([
          service.getSelectedObjects(objectsData), service.getPermissionMetadata(),
        ]);
        const catalog = objects.find((object) => object.objectType === 'CATALOG' && object.status === 'NEW');
        const blankRoleId = crypto.randomUUID();
        // Reconciling is idempotent: known roles are merged, removed roles are not re-added.
        const apply = (roles: RoleAssignment[]) => {
          const next = reconcilePermissions(latestData.current, objects, roles, environment);
          if (catalog && !next.initializedCatalogIds?.includes(catalog.objectId)) {
            const role = createBlankRole(blankRoleId, objects, environment, catalog.objectId);
            next.roleAssignments.push(role);
            next.initializedCatalogIds = [...(next.initializedCatalogIds ?? []), catalog.objectId];
          }
          onChange(next);
        };
        const roles = await service.getExistingRolesForObjects(objects, environment, (partial) => {
          if (!active) return;
          apply(partial);
          setLoaded({ objects, metadata });
          setLoading(false);
          setDiscovering(true);
        });
        if (!active) return;
        apply(roles);
        setLoaded({ objects, metadata });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load permissions.');
      } finally {
        if (active) {
          setLoading(false);
          setDiscovering(false);
        }
      }
    }
    void load();
    return () => { active = false; };
    // Role edits do not trigger rediscovery. A scope/environment change remounts the editor.
  }, [objectsData, environment, service, onChange, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { loaded, error, loading, discovering, retry };
}
