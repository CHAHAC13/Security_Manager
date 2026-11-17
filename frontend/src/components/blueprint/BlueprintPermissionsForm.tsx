import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RoleAssignmentRows } from './RoleAssignmentRows';
import { CreateRoleAssignmentDialog } from './CreateRoleAssignmentDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { createBlankRole, hasPermissionErrors, refreshRole, scopedObjects, validatePermissions } from '@/lib/permissions';
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

const ROLE_GROUPS_PER_PAGE = 5;

function focusFirstError(container: HTMLDivElement | null) {
  requestAnimationFrame(() => {
    const target = container?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!target) return;
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    target.focus();
  });
}

export function BlueprintPermissionsForm({ data, objectsData, environment, onChange, onBack, onReadyChange, ref, service = permissionsService }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [creationScope, setCreationScope] = useState<PermissionObject | null>(null);
  const [errors, setErrors] = useState<PermissionsErrors>({ roles: {} });
  const [validating, setValidating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const { loaded, loading, discovering, error, retry } = usePermissions(objectsData, data, environment, onChange, service);
  const ready = !loading && !discovering && !error && Boolean(loaded?.objects.length) && !validating;
  const totalPages = Math.max(1, Math.ceil(data.roleAssignments.length / ROLE_GROUPS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * ROLE_GROUPS_PER_PAGE;
  const visibleRoles = data.roleAssignments.slice(pageStart, pageStart + ROLE_GROUPS_PER_PAGE);
  useEffect(() => { onReadyChange(ready); return () => onReadyChange(false); }, [onReadyChange, ready]);
  function showErrors(next: PermissionsErrors) {
    setErrors(next);
    const firstInvalidIndex = data.roleAssignments.findIndex((role) =>
      Object.values(next.roles[role.id] ?? {}).some(Boolean));
    if (firstInvalidIndex >= 0) setPage(Math.floor(firstInvalidIndex / ROLE_GROUPS_PER_PAGE) + 1);
    const invalidAccess = Object.keys(next.roles).filter((id) => next.roles[id].objectPermissions);
    setExpandedIds((current) => [...new Set([...current, ...invalidAccess])]);
    focusFirstError(container.current);
  }
  useImperativeHandle(ref, () => ({
    setServerErrors: showErrors,
    async validate() {
      if (!loaded || loading || discovering || error || !loaded.objects.length || validating) return false;
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
    setPage(Math.floor(data.roleAssignments.length / ROLE_GROUPS_PER_PAGE) + 1);
    setCreating(false);
    setErrors({ roles: {} });
  }
  return (
    <div ref={container} className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck className="h-4 w-4 text-sky-600" />Permissions</h2>
            <p className="mt-1 text-sm text-slate-500">Manage role assignments, object privileges and Request Manager settings in one configuration matrix.</p>
            {service === permissionsService && <p className="mt-2 text-xs text-slate-500">
              Direct and inherited permissions are loaded from the API without changing grants. Inherited access is read-only.
              Only your explicit edits create pending changes. Changes stay in this wizard; role-name validation,
              draft saving and applying grants are not connected yet. Role types and Request Manager settings are not returned by discovery.
            </p>}
          </div>
        </div>
      </div>
      {loading && <div role="status" aria-label="Loading permissions" className="animate-pulse rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading permissions...</div>}
      {error && !loading && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error} <Button onClick={retry}>Retry</Button></div>}
      {!loading && !error && loaded?.objects.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="mb-4 text-sm text-slate-500">No objects have been selected.</p><Button onClick={onBack}>Back to Objects</Button>
      </div>}
      {errors.configuration && <p role="alert" tabIndex={-1} aria-invalid="true" className="text-sm text-rose-700">{errors.configuration}</p>}
      {validating && <p role="status" className="text-sm text-slate-500">Validating role names...</p>}
      {discovering && !error && <p role="status" aria-label="Loading more role groups" className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-800">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading more role groups... {data.roleAssignments.length} found so far.
      </p>}
      {!loading && !error && loaded && loaded.objects.length > 0 && <fieldset disabled={validating} className="min-w-0 space-y-4">
        <legend className="sr-only">Role assignments</legend>
        <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 id="permissions-matrix-title" className="text-sm font-semibold text-slate-900">Configuration Matrix</h3>
              <p id="permissions-matrix-help" className="mt-1 text-xs text-slate-500">Role settings and scope grants stay visible. Expand access to edit schemas and objects. Scroll horizontally to view all columns.</p>
            </div>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              {data.roleAssignments.length} {data.roleAssignments.length === 1 ? 'role assignment' : 'role assignments'}
            </span>
          </div>
          <div role="region" aria-labelledby="permissions-matrix-title" aria-describedby="permissions-matrix-help"
            tabIndex={0} className="relative custom-scrollbar overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
            <table className="w-full min-w-[1320px] table-fixed text-left text-xs">
              <caption className="sr-only">Role permissions configuration matrix</caption>
              <thead className="border-b-2 border-slate-300 bg-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-700 [&_th]:border-r [&_th]:border-slate-200 [&_th:last-child]:border-r-0">
                <tr>
                  <th scope="col" className="w-[150px] px-4 py-3">Level / Scope</th>
                  <th scope="col" className="w-[235px] px-4 py-3">Role Name</th>
                  <th scope="col" className="w-[185px] px-4 py-3">Object</th>
                  <th scope="col" className="w-[260px] px-4 py-3">Privileges</th>
                  <th scope="col" className="w-[135px] px-4 py-3">Request Manager</th>
                  <th scope="col" className="w-[135px] px-4 py-3">Form Type</th>
                  <th scope="col" className="w-[145px] px-4 py-3">Display Name</th>
                  <th scope="col" className="w-[75px] px-3 py-3">Actions</th>
                </tr>
              </thead>
              {!data.roleAssignments.length && <tbody><tr><td colSpan={8} className="p-10 text-center text-sm text-slate-500">
                No role assignments yet. Create a role assignment to configure access.
              </td></tr></tbody>}
              {visibleRoles.map((role, index) => <RoleAssignmentRows key={role.id} role={role} groupNumber={pageStart + index + 1} objects={loaded.objects}
                metadata={loaded.metadata} environment={environment} errors={errors.roles[role.id] ?? {}} onChange={updateRole}
                expanded={expandedIds.includes(role.id)}
                onToggle={() => setExpandedIds((current) => current.includes(role.id)
                  ? current.filter((id) => id !== role.id) : [...current, role.id])}
                onRemove={() => {
                  if (role.status === 'EXISTING' && !window.confirm(`Remove ${role.roleName} from this blueprint? This does not delete the Databricks role.`)) return;
                  onChange({ ...data, roleAssignments: data.roleAssignments.filter((current) => current.id !== role.id) });
                  setPage(Math.min(currentPage, Math.max(1, Math.ceil((data.roleAssignments.length - 1) / ROLE_GROUPS_PER_PAGE))));
                  setExpandedIds((current) => current.filter((id) => id !== role.id));
                }} />)}
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 bg-slate-50/50 px-5 py-4">
            <Button type="button" variant="primary" icon={<Plus className="h-3.5 w-3.5" />}
              disabled={!ready} onClick={() => { setCreationScope(null); setCreating(true); }}>
              Create Role Assignment
            </Button>
            {data.roleAssignments.length > 0 && <nav aria-label="Role groups pagination" className="flex flex-wrap items-center gap-3">
              <span role="status" className="text-xs text-slate-500">
                Role groups {pageStart + 1}-{pageStart + visibleRoles.length} of {data.roleAssignments.length} | Page {currentPage} of {totalPages}
              </span>
              <Button type="button" aria-label="Previous role groups page" disabled={currentPage === 1}
                className="disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setPage(currentPage - 1)}>Previous</Button>
              <Button type="button" aria-label="Next role groups page" disabled={currentPage === totalPages}
                className="disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setPage(currentPage + 1)}>Next</Button>
            </nav>}
          </div>
        </div>
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
          const role = createBlankRole(crypto.randomUUID(), loaded.objects, environment);
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
