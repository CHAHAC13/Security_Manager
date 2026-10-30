import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RoleAssignmentCard } from './RoleAssignmentCard';
import { CreateRoleAssignmentDialog } from './CreateRoleAssignmentDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { createRole, hasPermissionErrors, refreshRole, scopedObjects, validatePermissions } from '@/lib/permissions';
import { PermissionsValidationError, permissionsService, type PermissionsService } from '@/services/permissionsService';
import type { BlueprintPermissionsData, BlueprintObjectsData, PermissionEnvironment, PermissionObject, PermissionsErrors, RoleAssignment } from '@/types/blueprint';

export interface PermissionsFormHandle {
  validate: () => Promise<boolean>;
  setServerErrors: (errors: PermissionsErrors) => void;
}

interface Props {
  data: BlueprintPermissionsData;
  objectsData: BlueprintObjectsData;
  environment: PermissionEnvironment;
  onChange: (data: BlueprintPermissionsData) => void;
  onBack: () => void;
  onReadyChange: (ready: boolean) => void;
  ref?: Ref<PermissionsFormHandle>;
  service?: PermissionsService;
}

function focusFirstError(container: HTMLDivElement | null) {
  requestAnimationFrame(() => {
    const target = container?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!target) return;
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    target.focus();
  });
}

export function BlueprintPermissionsForm({ data, objectsData, environment, onChange, onBack, onReadyChange, ref, service = permissionsService }: Props) {
  const { loaded, loading, error, retry } = usePermissions(objectsData, data, environment, onChange, service);
  const container = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [creationScope, setCreationScope] = useState<PermissionObject | null>(null);
  const [errors, setErrors] = useState<PermissionsErrors>({ roles: {} });
  const [validating, setValidating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const ready = !loading && !error && Boolean(loaded?.objects.length) && !validating;
  useEffect(() => { onReadyChange(ready); return () => onReadyChange(false); }, [onReadyChange, ready]);
  function showErrors(next: PermissionsErrors) {
    setErrors(next);
    setExpandedIds((current) => [...new Set([...current, ...Object.keys(next.roles)])]);
    focusFirstError(container.current);
  }
  useImperativeHandle(ref, () => ({
    setServerErrors: showErrors,
    async validate() {
      if (!loaded || loading || error || !loaded.objects.length || validating) return false;
      const next = validatePermissions(data, environment, loaded.objects, loaded.metadata);
      if (hasPermissionErrors(next)) { showErrors(next); return false; }
      setValidating(true);
      try {
        const results = await Promise.all(data.roleAssignments.filter((role) => role.status === 'NEW').map(async (role) => ({
          id: role.id, result: await service.validateRoleName(role.roleName, environment),
        })));
        results.forEach(({ id, result }) => {
          if (!result.valid) next.roles[id] = { roleName: result.message || 'This role name is already in use in this environment.' };
        });
        showErrors(next);
        return !hasPermissionErrors(next);
      } catch (cause) {
        showErrors(cause instanceof PermissionsValidationError ? cause.errors : {
          configuration: cause instanceof Error ? cause.message : 'Unable to validate role names. Try Next again.',
          roles: {},
        });
        return false;
      } finally {
        setValidating(false);
      }
    },
  }));
  function updateRole(role: RoleAssignment) {
    onChange({ ...data, roleAssignments: data.roleAssignments.map((current) => current.id === role.id ? role : current) });
    setErrors((current) => ({ ...current, roles: { ...current.roles, [role.id]: {} } }));
  }
  function addRole(role: RoleAssignment) {
    if (data.roleAssignments.some((current) => current.id === role.id)) return;
    onChange({
      ...data, roleAssignments: [...data.roleAssignments, role],
      discoveredRoleIds: role.status === 'EXISTING' ? [...new Set([...data.discoveredRoleIds, role.id])] : data.discoveredRoleIds,
    });
    setCreating(false);
    if (role.status === 'NEW') setExpandedIds((current) => [...current, role.id]);
    setErrors({ roles: {} });
  }
  return (
    <div ref={container} className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck className="h-4 w-4 text-sky-600" />Permissions</h2>
            <p className="mt-1 text-sm text-slate-500">Configure roles and permissions for the objects selected in the previous step.</p>
            {service === permissionsService && <p className="mt-2 text-xs text-slate-500">
              Direct and inherited permissions are loaded from the API without changing grants. Inherited access is read-only.
              Only your explicit edits create pending changes. Changes stay in this wizard; role-name validation,
              draft saving and applying grants are not connected yet. Role types and Request Manager settings are not returned by discovery.
            </p>}
          </div>
          {ready && <Button type="button" onClick={() => { setCreationScope(null); setCreating(true); }}>+ Create Role Assignment</Button>}
        </div>
      </div>
      {loading && <div role="status" aria-label="Loading permissions" className="animate-pulse rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading permissions...</div>}
      {error && !loading && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error} <Button onClick={retry}>Retry</Button></div>}
      {!loading && !error && loaded?.objects.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="mb-4 text-sm text-slate-500">No objects have been selected.</p><Button onClick={onBack}>Back to Objects</Button>
      </div>}
      {errors.configuration && <p role="alert" tabIndex={-1} aria-invalid="true" className="text-sm text-rose-700">{errors.configuration}</p>}
      {validating && <p role="status" className="text-sm text-slate-500">Validating role names...</p>}
      {!loading && !error && loaded && loaded.objects.length > 0 && <fieldset disabled={validating} className="min-w-0 space-y-4">
        <legend className="sr-only">Role assignments</legend>
        {!data.roleAssignments.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No role assignments yet. Create a role assignment to configure access.</p>}
        {data.roleAssignments.length > 0 && <div className="flex justify-end gap-3">
          <Button type="button" onClick={() => setExpandedIds(data.roleAssignments.map((role) => role.id))}>Expand All</Button>
          <Button type="button" onClick={() => setExpandedIds([])}>Collapse All</Button>
        </div>}
        {data.roleAssignments.map((role) => <RoleAssignmentCard key={role.id} role={role} objects={loaded.objects}
          metadata={loaded.metadata} environment={environment} errors={errors.roles[role.id] ?? {}} onChange={updateRole}
          expanded={expandedIds.includes(role.id)}
          onToggle={() => setExpandedIds((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])}
          onRemove={() => {
            if (role.status === 'EXISTING' && !window.confirm(`Remove ${role.roleName} from this blueprint? This does not delete the Databricks role.`)) return;
            onChange({ ...data, roleAssignments: data.roleAssignments.filter((current) => current.id !== role.id) });
            setExpandedIds((current) => current.filter((id) => id !== role.id));
          }} />)}
        {loaded.objects.filter((object) => object.status === 'NEW' && !['CATALOG', 'SCHEMA'].includes(object.objectType)
          && !data.roleAssignments.some((role) => scopedObjects(role, loaded.objects).some((item) => item.objectId === object.objectId)))
          .map((object) => <div key={object.objectId} role="note" aria-label={`No role coverage: ${object.objectName}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
            <p>New object <span className="font-semibold">{object.objectName}</span> has no role coverage.</p>
            <Button type="button" onClick={() => { setCreationScope(object); setCreating(true); }}>Create role for this object</Button>
          </div>)}
      </fieldset>}
      {creating && loaded && <CreateRoleAssignmentDialog objects={loaded.objects} environment={environment}
        assignedIds={data.roleAssignments.map((role) => role.id)} service={service} onClose={() => setCreating(false)}
        onNew={() => {
          const role = createRole(crypto.randomUUID(), loaded.objects, environment, loaded.metadata.roleTypes[0]?.code ?? '');
          addRole(creationScope ? refreshRole({
            ...role,
            level: creationScope.objectType === 'CATALOG' ? 'CATALOG' : creationScope.objectType === 'SCHEMA' ? 'SCHEMA' : 'OBJECT',
            scopeObjectId: creationScope.objectId,
          }, loaded.objects, environment) : role);
        }}
        onExisting={(role) => addRole(refreshRole(role, loaded.objects, environment))} />}
    </div>
  );
}
