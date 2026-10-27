import { Badge } from '@/components/ui/Badge';
import { inheritedCatalogPermissions, scopedObjects } from '@/lib/permissions';
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
    const inherited = inheritedCatalogPermissions(role, object, objects);
    const children = scoped.filter((item) => item.parentId === object.objectId);
    const privileges = [...new Set([
      ...metadata.permissionOptions[object.objectType],
      ...(permission?.originalPermissions ?? []),
      ...(permission?.permissions ?? []),
    ])];
    return <li key={object.objectId} className="min-w-0 space-y-3">
      <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <legend className="flex max-w-full items-center gap-2 px-1 text-xs">
          <span className="truncate font-semibold text-slate-900" title={object.objectName}>{object.objectName}</span>
          <span className="text-[10px] text-slate-500">{object.objectType}</span>
          <Badge variant={object.status === 'NEW' ? 'emerald' : 'slate'}>{object.status === 'NEW' ? 'New' : 'Existing'}</Badge>
        </legend>
        {inherited.length > 0 && <p className="mb-3 text-xs text-sky-700">Inherited from catalog: {inherited.join(', ')} (informational only)</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {privileges.map((privilege) => {
            const checked = permission?.permissions.includes(privilege) ?? false;
            const original = permission?.originalPermissions.includes(privilege) ?? false;
            const allowed = metadata.permissionOptions[object.objectType].includes(privilege);
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
              {checked && !original && <span className="font-medium text-emerald-700">Added</span>}
              {!checked && original && <span className="font-medium text-rose-700">Removed</span>}
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
