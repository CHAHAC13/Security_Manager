import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { allowedPermissionOptions, scopedObjects } from '@/lib/permissions';
import type { PermissionMetadata, PermissionObject, RoleAssignment } from '@/types/blueprint';

interface Props {
  objects: PermissionObject[];
  role: RoleAssignment;
  metadata: PermissionMetadata;
  onChange: (role: RoleAssignment) => void;
}

export function ResourcePermissions({ objects, role, metadata, onChange }: Props) {
  const scoped = scopedObjects(role, objects);
  const scopedIds = new Set(scoped.map((object) => object.objectId));
  function renderResource(object: PermissionObject) {
    const permission = role.objectPermissions.find((item) => item.objectId === object.objectId);
    const inherited = permission?.discoveredAssignments?.flatMap((assignment) =>
      assignment.privileges.filter((privilege) => privilege.inherited)) ?? [];
    const children = scoped.filter((item) => item.parentId === object.objectId);
    const allowedPrivileges = allowedPermissionOptions({
      objectType: object.objectType, originalPermissions: permission?.originalPermissions ?? [],
    }, metadata);
    const privileges = [...new Set([
      ...allowedPrivileges,
      ...(permission?.permissions ?? []),
    ])];
    const changed = permission && (permission.permissions.length !== permission.originalPermissions.length
      || permission.originalPermissions.some((privilege) => !permission.permissions.includes(privilege)));
    return <li key={object.objectId} className="min-w-0 space-y-3">
      <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <legend className="flex max-w-full items-center gap-2 px-1 text-xs">
          <span className="truncate font-semibold text-slate-900" title={object.objectName}>{object.objectName}</span>
          <span className="text-[10px] text-slate-500">{object.objectType}</span>
          <Badge variant={object.status === 'NEW' ? 'emerald' : 'slate'}>{object.status === 'NEW' ? 'New' : 'Existing'}</Badge>
        </legend>
        {inherited.length > 0 && <section aria-label={`Inherited permissions for ${object.objectName}`}
          className="mb-4 space-y-2 rounded-md border border-sky-100 bg-sky-50 p-3 text-xs">
          <h5 className="font-semibold text-sky-900">Inherited permissions (read-only)</h5>
          <ul className="space-y-2">
            {inherited.map((detail, index) => <li key={index} className="flex flex-wrap items-center gap-2 text-sky-800">
              <span className="font-mono">{detail.privilege}</span>
              <span>Inherited from {detail.inherited_from_type ?? 'source type not provided'}:</span>
              <span className="break-all font-mono">{detail.inherited_from_name ?? 'source name not provided'}</span>
            </li>)}
          </ul>
        </section>}
        <p className="mb-3 text-xs font-semibold text-slate-700">Direct grants (editable)</p>
        {changed && permission.originalPermissions.length > 0 && <Button type="button"
          aria-label={`Restore original permissions for ${object.objectName}`}
          className="mb-3"
          onClick={() => onChange({
            ...role, objectPermissions: role.objectPermissions.map((item) => item.objectId === object.objectId
              ? { ...item, permissions: [...item.originalPermissions] } : item),
          })}>
          Restore original permissions
        </Button>}
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {privileges.map((privilege) => {
            const checked = permission?.permissions.includes(privilege) ?? false;
            const original = permission?.originalPermissions.includes(privilege) ?? false;
            const allowed = allowedPrivileges.includes(privilege);
            return <label key={privilege} className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" aria-label={`${object.objectName}: ${privilege}`} checked={checked} disabled={!allowed && !checked}
                onChange={(event) => {
                  const current = permission ?? {
                    objectId: object.objectId, objectName: object.objectName, objectType: object.objectType,
                    originalPermissions: [], permissions: [],
                  };
                  const updated = {
                    ...current,
                    permissions: event.target.checked ? [...new Set([...current.permissions, privilege])]
                      : current.permissions.filter((value) => value !== privilege),
                  };
                  onChange({
                    ...role,
                    objectPermissions: permission
                      ? role.objectPermissions.map((item) => item.objectId === object.objectId ? updated : item)
                      : [...role.objectPermissions, updated],
                  });
                }} className="rounded border-slate-300 text-sky-600" />
              {privilege}
              {checked && !original && <span className="font-medium text-emerald-700">Pending addition</span>}
              {!checked && original && <span className="font-medium text-rose-700">Pending removal</span>}
              {!allowed && <span className="text-rose-700">Unsupported; remove before continuing</span>}
            </label>;
          })}
        </div>
      </fieldset>
      {children.length > 0 && <ul className="space-y-3 border-l border-slate-200 pl-3 sm:pl-5">{children.map(renderResource)}</ul>}
    </li>;
  }
  return <ul className="space-y-3">{scoped.filter((object) => !object.parentId || !scopedIds.has(object.parentId)).map(renderResource)}</ul>;
}
