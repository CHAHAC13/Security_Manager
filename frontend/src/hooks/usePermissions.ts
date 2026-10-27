import { useCallback, useEffect, useState } from 'react';
import { reconcilePermissions } from '@/lib/permissions';
import type { BlueprintObjectsData, BlueprintPermissionsData, PermissionEnvironment, PermissionMetadata, PermissionObject } from '@/types/blueprint';
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
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [objects, metadata] = await Promise.all([
          service.getSelectedObjects(objectsData), service.getPermissionMetadata(),
        ]);
        const roles = await service.getExistingRolesForObjects(objects, environment);
        if (!active) return;
        onChange(reconcilePermissions(data, objects, roles, environment));
        setLoaded({ objects, metadata });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load permissions.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
    // Role edits do not trigger rediscovery. A scope/environment change remounts the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectsData, environment, service, onChange, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { loaded, error, loading, retry };
}
