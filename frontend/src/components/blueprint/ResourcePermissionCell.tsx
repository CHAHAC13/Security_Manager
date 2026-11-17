import { Button } from '@/components/ui/Button';
import { allowedPermissionOptions } from '@/lib/permissions';
import type { PermissionMetadata, PermissionObject, RoleAssignment } from '@/types/blueprint';

interface Props {
  object: PermissionObject;
  role: RoleAssignment;
  metadata: PermissionMetadata;
  onChange: (role: RoleAssignment) => void;
}

export function ResourcePermissionCell({ object, role, metadata, onChange }: Props) {
  const permission = role.objectPermissions.find((item) => item.objectId === object.objectId);
  const inherited = permission?.discoveredAssignments?.flatMap((assignment) =>
    assignment.privileges.filter((privilege) => privilege.inherited)) ?? [];
  const allowedPrivileges = allowedPermissionOptions({
    objectType: object.objectType, originalPermissions: permission?.originalPermissions ?? [],
  }, metadata);
  const privileges = [...new Set([
    ...allowedPrivileges,
    ...(permission?.permissions ?? []),
  ])];
  const changed = permission && (permission.permissions.length !== permission.originalPermissions.length
    || permission.originalPermissions.some((privilege) => !permission.permissions.includes(privilege)));
  return <fieldset className="min-w-0">
    <legend className="mb-2 text-[10px] font-semibold text-slate-500">Direct grants (editable)<span className="sr-only"> for {object.objectName}</span></legend>
    {changed && permission.originalPermissions.length > 0 && <Button type="button"
      aria-label={`Restore original permissions for ${object.objectName}`}
      className="mb-3"
      onClick={() => onChange({
        ...role, objectPermissions: role.objectPermissions.map((item) => item.objectId === object.objectId
          ? { ...item, permissions: [...item.originalPermissions] } : item),
      })}>
      Restore original permissions
    </Button>}
    <div className="flex flex-wrap gap-2">
      {privileges.map((privilege) => {
        const checked = permission?.permissions.includes(privilege) ?? false;
        const original = permission?.originalPermissions.includes(privilege) ?? false;
        const allowed = allowedPrivileges.includes(privilege);
        return <label key={privilege} className={`flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] ${checked ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-600'}`}>
          <input type="checkbox" aria-label={`${object.objectName}: ${privilege}`} checked={checked} disabled={!allowed && !checked}
            onChange={(event) => {
              const current = permission ?? {
                objectId: object.objectId, objectName: object.objectName, objectType: object.objectType, parentId: object.parentId,
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
    {inherited.length > 0 && <section aria-label={`Inherited permissions for ${object.objectName}`}
      className="mt-3 space-y-2 rounded-md border border-sky-100 bg-sky-50 p-2 text-[10px]">
      <h4 className="font-semibold text-sky-900">Inherited permissions (read-only)</h4>
      <ul className="space-y-2">
        {inherited.map((detail, index) => <li key={index} className="space-y-0.5 text-sky-800">
          <span className="font-mono">{detail.privilege}</span>
          <p>Inherited from {detail.inherited_from_type ?? 'source type not provided'}: <span className="break-all font-mono">{detail.inherited_from_name ?? 'source name not provided'}</span></p>
        </li>)}
      </ul>
    </section>}
  </fieldset>;
}
