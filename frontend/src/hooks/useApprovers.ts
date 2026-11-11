import { useCallback, useEffect, useRef, useState } from 'react';
import { mergePrefilledApprovers, reconcileApprovers } from '@/lib/approvers';
import type { ApproverService } from '@/services/approverService';
import type { BlueprintApproversData, PermissionObject, RoleAssignment } from '@/types/blueprint';

/**
 * Loads current approvers for existing roles (once per role) and the selected object hierarchy
 * used for scope labels. Roles themselves come from the Permissions step and are never refetched.
 */
export function useApprovers(
  roles: RoleAssignment[],
  data: BlueprintApproversData,
  onChange: (value: BlueprintApproversData) => void,
  blueprintId: string,
  service: ApproverService,
  loadScopeObjects: () => Promise<PermissionObject[]>,
) {
  const [objects, setObjects] = useState<PermissionObject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  // Re-run only when the set of roles actually changes, not on every new array reference.
  const roleKey = roles.map((role) => `${role.id}\u0000${role.status}\u0000${role.roleName}\u0000${role.scopeObjectId}`).join('\u0001');
  const latest = useRef({ roles, data, onChange });
  useEffect(() => { latest.current = { roles, data, onChange }; });
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const { roles, data } = latest.current;
      try {
        const pending = roles.filter((role) => role.status === 'EXISTING' && !data.prefilledRoleIds.includes(role.id));
        const [scopeObjects, fetched] = await Promise.all([
          // Scope labels are informational; a failure here must not block approver assignment.
          roles.length ? loadScopeObjects().catch(() => [] as PermissionObject[]) : Promise.resolve([]),
          pending.length
            ? service.getRoleApprovers({ blueprintId, roles: pending.map((role) => ({ roleId: role.id, roleName: role.roleName })) })
            : Promise.resolve({}),
        ]);
        if (!active) return;
        const { data: current, onChange } = latest.current;
        let next = reconcileApprovers(current, roles.map((role) => role.id));
        if (pending.length) next = mergePrefilledApprovers(next, fetched, pending.map((role) => role.id));
        if (next !== current) onChange(next);
        setObjects(scopeObjects);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load current approvers.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
    // Roles/data/onChange are read from a ref: approver edits and new callback identities must not reload.
  }, [roleKey, blueprintId, service, loadScopeObjects, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { objects, loading, error, retry };
}
